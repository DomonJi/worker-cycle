import { Observable } from 'rxjs/Observable'
import { Notification } from 'rxjs/Notification'
import 'rxjs/add/observable/fromEvent'
import 'rxjs/add/observable/merge'
import 'rxjs/add/operator/first'
import 'rxjs/add/operator/materialize'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/partition'
import 'rxjs/add/operator/takeUntil'
import 'rxjs/add/operator/do'
// @ts-nocheck
import 'core-js/es6/map'
import 'core-js/es6/set'
import 'core-js/es6/symbol'
import 'core-js/modules/es6.array.from'

import { WorkerClientMessage, WorkerMessage, WorkerMethod, WorkerStatusId, Cloneable, isMessage } from './worker-client'

interface Map<K, V> {
  clear(): void
  delete(key: K): boolean
  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void
  get(key: K): V | undefined
  has(key: K): boolean
  set(key: K, value: V): this
  readonly size: number
  [Symbol.iterator](): IterableIterator<[K, V]>
  entries(): IterableIterator<[K, V]>
  keys(): IterableIterator<K>
  values(): IterableIterator<V>
}

interface MapConstructor {
  new(): Map<any, any>
  new<K, V>(entries?: ReadonlyArray<[K, V]> | null): Map<K, V>
  readonly prototype: Map<any, any>
}

declare const Map: MapConstructor
declare const self: Window & {
  postMessage: (message: WorkerMessage<Cloneable>) => void
}
const ctx = self

type ExecResult = Cloneable | Observable<Cloneable> | Promise<Cloneable> | void

type ExecFunc<T extends any[]> = (method: string, ...params: T) => ExecResult
type RegexExecFunc<T extends any[]> = (matched: RegExpMatchArray, ...params: T) => ExecResult
type SetUpFunc<T extends any[] | undefined> = (params: T, on: OnFunc['on']) => ExecResult

type NotificationHandlers = Record<Notification<Cloneable>['kind'], (id: number, not: Notification<Cloneable>) => WorkerMessage>
interface OnFunc {
  on<T extends any[]>(tester: RegExp, handler: RegexExecFunc<T>): void
  on<T extends any[]>(tester: string, handler: ExecFunc<T>): void
  on<T extends any[]>(handler: ExecFunc<T>): void
}

const notificationHandler: NotificationHandlers = {
  'N': (id, { value: data }) => ({ id, result: { data } }),
  'E': (id, { error }) => ({ id, error: error.message || error.toString() }),
  'C': (id) => ({ id, result: { complete: true } }),
}

const isPromiseLike = <T extends Cloneable>(input: any): input is PromiseLike<T> => {
  return input && typeof input.then === 'function'
}

const convertObservable = (input: ExecResult): Observable<Cloneable> => {
  if (typeof input === 'undefined') {
    return Observable.empty()
  } else if (isPromiseLike(input)) {
    return Observable.fromPromise(input)
  } else if (!(input instanceof Observable)) {
    return Observable.of(input)
  }
  return input
}

export const setUpWorker = <T extends any[] | undefined = undefined>(
  setUpFunc: SetUpFunc<T>,
  cleanUpFunc?: () => ExecResult,
) => {
  const methodMap = new Map<string | RegExp, Function>()
  const defaults = 'default'
  const matchedCache = new Map<string, RegExpMatchArray>()
  let debug = false

  const on: OnFunc['on'] = (...args: [string | RegExp, Function] | [Function]) => {
    args.length === 1
      ? methodMap.set(defaults, args[0])
      : methodMap.set(...args)
  }

  const execFunc = (method: string, params: any[] = []) => {
    let matchRegex: RegExpMatchArray | null = null
    let matchDefault: boolean | undefined = undefined

    const func = (() => {
      if (methodMap.has(method)) {
        return methodMap.get(method)
      }

      for (const tester of methodMap.keys() as any) {
        if (!(tester instanceof RegExp)) { continue }
        const matched = method.match(tester)
        if (matched) {
          matchRegex = matched
          return methodMap.get(tester)
        }
      }

      matchDefault = true
      return methodMap.get(defaults)
    })()!

    if (matchRegex || matchDefault) {
      methodMap.set(method, func)
      matchRegex && matchedCache.set(method, matchRegex)
    }

    try {
      return func(matchRegex || matchedCache.get(method) || method, ...params)
    } catch (e) {
      return Observable.throw(e)
    }
  }

  const [worker$, message$] = Observable.fromEvent<WorkerClientMessage>(ctx, 'message', e => e.data)
    .partition(({ method }) => /^@worker\//.test(method))

  const init$ = worker$.first(isMessage(WorkerMethod.Initialize))
    .mergeMap(({ params }) => convertObservable(setUpFunc(<T>params, on)))
    .do({
      complete: () => ctx.postMessage({ id: WorkerStatusId.Ready, result: { complete: true } })
    })

  const close$ = worker$.first(isMessage(WorkerMethod.Close))
    .mergeMap(() => convertObservable(cleanUpFunc && cleanUpFunc()))
    .do({ complete: () => close() })

  const debug$ = worker$
    .filter(isMessage(WorkerMethod.Debug))
    .do(({ params: [value] }) => debug = value)

  const main$ = message$
    .mergeMap(({ id, method, params, __timestamp }) => {
      let timeStamp: number
      if (debug) {
        timeStamp = Date.now()
        console.info('Worker received', { id, method, params }, 'after Client post:', timeStamp - __timestamp!, 'ms')
      }
      return convertObservable(execFunc(method, params))
        .takeUntil(worker$.first(isMessage(WorkerMethod.Unsubscribe, id)))
        .materialize()
        .filter(() => typeof id !== 'undefined')
        .map(notification => notificationHandler[notification.kind](id!, notification))
        .do(msg => {
          if (debug) {
            const responseAt = Date.now()
            console.info('Worker post', msg, 'after last post or receive:', responseAt - timeStamp, 'ms')
            timeStamp = responseAt
            msg.__timestamp = responseAt
          }
          ctx.postMessage(msg)
        })
    })

  Observable.merge(init$, close$, main$, debug$).subscribe()
}
