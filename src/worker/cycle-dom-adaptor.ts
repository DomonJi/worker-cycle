import { Component } from '../interfaces';
import { WorkerClient, WorkerClientMessage } from './worker-client'
import { Stream } from 'xstream';
// @ts-nocheck
export const ComponentAdaptor: (workerClient: WorkerClient) => Component = (workerClient) => ({ DOM }) => {
  workerClient.message$.do(
    msg => {
      const { id, method, params } = msg as any as WorkerClientMessage<'events', [string[], any]>
      if (method === 'events') {
        DOM.select(params[0][0]).events(params[1])
          .subscribe({ next: () => workerClient.worker.postMessage({ id }) })
      }
    }
  ).subscribe()

  return {
    DOM: Stream.from(workerClient.request('dom'))
  }

}
