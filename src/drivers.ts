import { makeDOMDriver } from '@cycle/dom';

const driversFactories: any = {
    DOM: () => makeDOMDriver('#app'),
};

export function getDrivers(): any {
    return Object.keys(driversFactories)
        .map(k => ({ [k]: driversFactories[k]() }))
        .reduce((a, c) => ({ ...a, ...c }), {});
}
