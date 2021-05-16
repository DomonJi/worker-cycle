import { Stream } from 'xstream';
import { DOMSource, VNode } from '@cycle/dom';

export { Reducer } from '@cycle/state';

export type Component = (s: Sources) => Sinks

export interface Sources {
    DOM: DOMSource;
}

export interface Sinks {
    DOM?: Stream<VNode>;
}
