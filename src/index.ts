import { run } from '@cycle/run';
import { getDrivers } from './drivers';
import { Counter } from './components/counter';
import { WorkerClient } from './worker/worker-client';
import { ComponentAdaptor } from './worker/cycle-dom-adaptor';

const workerCreator = require('./worker/cycle-dom.worker.ts')

const workerClient = WorkerClient.create('cycle-dom', workerCreator)

workerClient.run().subscribe(() => {
  run(ComponentAdaptor(workerClient), getDrivers())
})

// run(Counter, getDrivers())

const animateDiv = document.createElement('div')
animateDiv.style.width = '100px'
animateDiv.style.height = '100px'
animateDiv.style.background = 'red'

document.body.append(animateDiv)
let i = 0
const animate = () => requestAnimationFrame(() => {
  animateDiv.style.marginLeft = `${(i++ % 100) * 10}px`
  requestAnimationFrame(animate)
})

requestAnimationFrame(animate)
