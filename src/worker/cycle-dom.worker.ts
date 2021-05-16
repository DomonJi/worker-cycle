import { setUpWorker } from './worker-scope'
import { Counter } from '../components/counter'
import { DocumentDOMSource } from '@cycle/dom/lib/cjs/DocumentDOMSource'
import { WorkerMessage, Cloneable, WorkerClientMessage } from './worker-client'
import { EventsFnOptions, MainDOMSource } from '@cycle/dom'
import { Observable, Observer } from 'rxjs'
import { Stream } from 'xstream'

// @ts-nocheck
declare const self: Window & {
  postMessage: (message: WorkerClientMessage<string, Cloneable[]>) => void
}
MainDOMSource
type PublicPart<T> = {[K in keyof T]: T[K]}

class QuantumDomSource implements PublicPart<DocumentDOMSource> {
  protected _name: string

  constructor(private selectors: string[] = []) {}
  public select(selector: string): DocumentDOMSource {
    return new QuantumDomSource(this.selectors.concat(selector)) as any
  }

  public events<K extends keyof DocumentEventMap>(
    eventType: K,
    options?: EventsFnOptions,
    bubbles?: boolean
  ): any {
    const id = (Math.random() * 100000).toFixed(5)
    const events$ = Observable.create((observer: Observer<any>) => {
      self.postMessage({ id, method: 'events', params: [this.selectors, eventType, options as any, bubbles] })
      const subs = Observable.fromEvent(self, 'message', msg => msg.data)
        .filter((msg) => msg.id === id)
        .subscribe({
          next: () => observer.next(1),
          complete: () => observer.complete(),
          error: () => observer.error('error')
        })

      return () => subs.unsubscribe()
    })

    return Stream.from(events$)
  }

  public element(): any {
    return
  }

  public elements(): any {
    return
  }
}

setUpWorker((params, on) => {
  const fakeDomSource = new QuantumDomSource()
  on('dom', () => Observable.from(Counter({ DOM: fakeDomSource }).DOM))
})
