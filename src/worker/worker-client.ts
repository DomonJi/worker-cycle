import { Observable } from 'rxjs'
import { Observer } from 'rxjs/Observer'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import { omit } from 'lodash'

export type NextResult<T> = { data: T }
export type CompleteResult = { complete: true }
export type SuccessResult<T = Cloneable> = { result: NextResult<T> | CompleteResult }
export type ErrorResult = { error: string }
export type WorkerMessage<T = Cloneable> = (SuccessResult<T> | ErrorResult) & { id: number, __timestamp?: number }
type BasicType = undefined | null | number | string | boolean | String | Boolean
  | RegExp | Date | Blob | File | FileList | ImageData | ArrayBuffer | ArrayBufferView
export type PlainObject = {
  [x: string]: BasicType | PlainObject | PlainObject[] | Map<PlainObject, PlainObject> | Set<PlainObject>
} | BasicType | BasicType[] | Map<BasicType, BasicType> | Set<BasicType>
export type Cloneable = PlainObject | PlainObject[] | BasicType | Map<PlainObject, PlainObject> | Set<PlainObject>

type BuiltInParamsMap = {
  [WorkerMethod.Debug]: [boolean]
  [WorkerMethod.Close]: undefined
  [WorkerMethod.Unsubscribe]: undefined
}

type ParamsType<
  M extends string = string,
  T extends Cloneable[] | undefined = Cloneable[] | undefined
> = M extends keyof BuiltInParamsMap ? BuiltInParamsMap[M] : T

export const isMessage =
<M extends WorkerMethod | string>(method: M, id?: number) => (msg: WorkerClientMessage): msg is WorkerClientMessage<M> => {
  return msg.method === method && (typeof id === 'undefined' || msg.id === id)
}

export interface WorkerClientMessage<
  M extends string = string,
  T extends Cloneable[] | undefined = Cloneable[] | undefined,
> {
  id?: number,
  method: M,
  params: ParamsType<M, T>,
  __timestamp?: number
}

export const enum WorkerMethod {
  Initialize = '@worker/initialize',
  Unsubscribe = '@worker/unsubscribe',
  Close = '@worker/close',
  Debug = '@worker/debug',
}

export const enum WorkerStatusId {
  Closed = -3,
  Loaded,
  Ready,
}

enum WorkerClientStatus {
  Stopped,
  Running,
}

const isErrorResult = (data: any): data is ErrorResult => !!data.error

export class WorkerClient {
  private nextId = 0
  private status$$ = new BehaviorSubject(WorkerClientStatus.Stopped)
  private _debug: boolean = false

  public message$: Observable<WorkerMessage> = undefined as any
  public ready$: Observable<{}> = undefined as any
  public error$: Observable<{}> = undefined as any
  public worker: Worker = undefined as any

  private static instances: Record<string, WorkerClient> = {}

  static create(name: string, workerCreator: () => Worker, initParams?: Cloneable[]) {
    if (!('Worker' in window)) {
      throw new Error('Browser dos not support web worker')
    }
    if (WorkerClient.instances[name]) {
      return WorkerClient.instances[name]
    }
    return new WorkerClient(name, workerCreator, initParams)
  }

  static get(name: string): WorkerClient | undefined {
    return WorkerClient.instances[name]
  }

  private constructor(private name: string, private workerCreator: () => Worker, private initParams?: Cloneable[]) {
    WorkerClient.instances[this.name] = this
  }

  get debug() {
    return this._debug
  }

  set debug(value) {
    this._debug = value
    this.notify(WorkerMethod.Debug, [value])
  }

  run() {
    return Observable.defer(() => {
      this.worker = this.workerCreator()
      this.message$ = Observable.fromEvent<WorkerMessage>(this.worker, 'message', e => e.data)
        .share()

      this.ready$ = this.message$
        .first(({ id }) => id === WorkerStatusId.Ready)
        .shareReplay(1)

      this.error$ = Observable.fromEvent<string>(this.worker, 'error').share()

      this.status$$.next(WorkerClientStatus.Running)
      this.notify(WorkerMethod.Initialize, this.initParams)
      return this.ready$
    })
  }

  request = <T>(method: string, params?: Cloneable[]): Observable<T> => {
    return Observable.create((observer: Observer<T>) => {
      const id = this.nextId++
      const msg: WorkerClientMessage = { id, method, params }

      if (this.debug) {
        msg.__timestamp = Date.now()
        console.info('Client request', { id, method, params }, 'at:', msg.__timestamp, 'ms')
      }
      this.worker.postMessage(msg)

      const subscription = this.message$
        .filter(message => message.id === id)
        .mergeMap(res => isErrorResult(res) ? Observable.throw(res.error) : Observable.of(res))
        .do(result => {
          if (this.debug) {
            const transferTime = Date.now() - result.__timestamp
            console.info(
              'Client received', omit(result, '__timestamp'),
              'after worker post:', transferTime, 'ms'
            )
          }
        })
        .takeWhile(({ result }: SuccessResult) => !(result as CompleteResult).complete)
        .pluck('result', 'data')
        .subscribe(observer)

      const statusSubscription = this.status$$
        .subscribe(status => {
          status !== WorkerClientStatus.Running && observer.error('Worker is stopped')
        })

      return () => {
        subscription.unsubscribe()
        statusSubscription.unsubscribe()
        this.worker.postMessage({ id, method: WorkerMethod.Unsubscribe })
      }
    })
  }

  notify = <M extends string = string>(method: M, params?: ParamsType<M>) => {
    this.status$$.first()
      .subscribe(status => {
        if (status === WorkerClientStatus.Running) {
          this.worker.postMessage({ method, params })
          if (this.debug) {
            console.info('Client notify', { method, params }, 'at:', Date.now(), 'ms')
          }
        } else {
          throw new Error('Worker is stopped')
        }
      })
  }

  close = () => {
    this.worker.postMessage({ id: WorkerStatusId.Closed, method: WorkerMethod.Close })
    delete WorkerClient.instances[this.name]
    this.status$$.next(WorkerClientStatus.Stopped)
  }
}
