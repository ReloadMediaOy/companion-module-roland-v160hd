'use strict'

// Node 18.17.0-safe timer control, shared by test/freezeOnOff.test.js and
// test/freezeTypeSelect.test.js (extracted here once both files needed it,
// to avoid two drifting copies). node:test's mock.timers does not exist at
// all on Node 18.17.0 — see either test file's own header for the original
// finding. Temporarily replaces the real global setTimeout/clearTimeout
// with a capturing stub for the duration of `fn`: setTimeout records the
// callback and requested delay and returns a fake id instead of scheduling
// anything for real; clearTimeout normally forgets that id, unless
// `bypassNextClear()` was called, in which case the NEXT clearTimeout call
// is a deliberate no-op (simulating a code path that misses cancellation)
// and the callback stays invocable. Restores the real globals in a
// `finally`, so a throwing test never leaks the stub.
const assert = require('node:assert/strict')

function withCapturedTimers(fn) {
	const realSetTimeout = global.setTimeout
	const realClearTimeout = global.clearTimeout
	const callbacks = new Map()
	const delays = new Map()
	const clearedIds = new Set()
	let nextId = 0
	let bypassNextClear = false
	global.setTimeout = (cb, delay) => {
		const id = ++nextId
		callbacks.set(id, cb)
		delays.set(id, delay)
		return id
	}
	global.clearTimeout = (id) => {
		if (bypassNextClear) {
			bypassNextClear = false
			return
		}
		callbacks.delete(id)
		clearedIds.add(id)
	}
	try {
		return fn({
			invoke: (id) => {
				const cb = callbacks.get(id)
				assert.ok(cb, `no live captured callback for timer id ${id} — it was already cleared or never scheduled`)
				cb()
			},
			delayOf: (id) => delays.get(id),
			wasCleared: (id) => clearedIds.has(id),
			bypassNextClear: () => {
				bypassNextClear = true
			},
		})
	} finally {
		global.setTimeout = realSetTimeout
		global.clearTimeout = realClearTimeout
	}
}

module.exports = { withCapturedTimers }
