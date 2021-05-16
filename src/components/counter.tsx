import xs, { Stream } from 'xstream';
import { VNode, DOMSource } from '@cycle/dom';

import { Sources, Sinks, Reducer } from '../interfaces';

export interface State {
  count: number;
}
export const defaultState: State = {
  count: 0
};

interface DOMIntent {
  increment$: Stream<null>;
  decrement$: Stream<null>;
}

function sleep(millis: number): void {
  const date = Date.now()
  let curDate = null
  do {
    curDate = Date.now()
  } while (curDate - date < millis)
}

export function Counter({ DOM }: Sources): Sinks {
  const { increment$, decrement$ }: DOMIntent = intent(DOM);

  const state$ = model(increment$, decrement$)
    .fold((count, reducer) => reducer(count) || defaultState, defaultState)

  return {
    DOM: view(state$),
  };
}

function model(
  increment$: Stream<any>,
  decrement$: Stream<any>
): Stream<Reducer<State>> {
  const init$ = xs.of<Reducer<State>>(
    prevState => (prevState === undefined ? defaultState : prevState)
  );

  const addToState: (n: number) => Reducer<State> = n => state => {
    sleep(1000)

    return {
      ...state,
      count: (state as State).count + n
    }
  }

  const add$ = increment$.mapTo(addToState(1));
  const subtract$ = decrement$.mapTo(addToState(-1));

  return xs.merge(init$, add$, subtract$);
}

function view(state$: Stream<State>): Stream<VNode> {
  return state$.map(({ count }) => (
    <div>
      <h2>My Awesome Cycle.js app - Counter</h2>
      <span>{ 'Counter: ' + count }</span>
      <button type="button" className="add">
        Increase
            </button>
      <button type="button" className="subtract">
        Decrease
            </button>
    </div>
  ));
}

function intent(DOM: DOMSource): DOMIntent {
  const increment$ = DOM.select('.add')
    .events('click')
    .mapTo(null);

  const decrement$ = DOM.select('.subtract')
    .events('click')
    .mapTo(null);

  return { increment$, decrement$ };
}
