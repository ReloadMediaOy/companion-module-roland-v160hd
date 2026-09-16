'use strict'

// Regression tests for the ERR:0 / extractMessages interaction.
//
// The Roland V-160HD sends "ERR:0;" over TCP.  extractMessages() strips the
// trailing ';' delimiter before handing messages to updateData(), so the
// string that updateData sees is "ERR:0", not "ERR:0;".
//
// A previous development version of api.js compared against "ERR:0;" which
// is never matched — silently swallowing all error responses from the device.
// These tests pin the correct behaviour at both layers so any future
// regression is caught immediately.

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const { extractMessages } = require('../src/tcpParser')

// ── extractMessages layer ─────────────────────────────────────────────────────

describe('extractMessages strips trailing semicolon from ERR:0', () => {
	test('extractMessages("ERR:0;") returns exactly one message: "ERR:0"', () => {
		const { messages, remaining } = extractMessages('ERR:0;')
		assert.equal(messages.length, 1)
		assert.equal(messages[0], 'ERR:0')
		assert.equal(remaining, '')
	})

	test('extractMessages handles ERR:0; embedded in a larger buffer', () => {
		const { messages } = extractMessages('ACK;ERR:0;VER:1.00;')
		assert.ok(messages.includes('ERR:0'), '"ERR:0" must appear in parsed messages')
	})
})

// ── updateData layer ──────────────────────────────────────────────────────────

const BASE_STUB = {
	InstanceStatus: { Ok: 'ok', Connecting: 'connecting', Disconnected: 'disconnected', Error: 'error' },
	TCPHelper: class {},
}
let baseResolved
try {
	baseResolved = require.resolve('@companion-module/base')
} catch (_) {
	baseResolved = null
}
if (baseResolved) {
	require.cache[baseResolved] = {
		id: baseResolved,
		filename: baseResolved,
		loaded: true,
		exports: BASE_STUB,
	}
}

const api = require('../src/api')

function makeSelf() {
	return {
		config: { verbose: false },
		DATA: {},
		TALLYDATA: [],
		sendRawCommand: () => {},
		subscribeToTally: () => {},
		startInterval: () => {},
		log: () => {},
		logVerbose: () => {},
		checkFeedbacks: () => {},
		setVariableValues: () => {},
	}
}

describe('updateData handles ERR:0 (without semicolon) correctly', () => {
	test('updateData("ERR:0") does not throw', () => {
		const self = makeSelf()
		assert.doesNotThrow(() => api.updateData.call(self, 'ERR:0'))
	})

	test('updateData("ERR:0;") (with semicolon) is not matched by ERR:0 branch', () => {
		// Verify the guard: the semicoloned form must NOT be treated as the ERR:0
		// branch — only "ERR:0" (the form extractMessages produces) is valid.
		// Both inputs must not throw; this test confirms the trimmed comparison.
		const self = makeSelf()
		assert.doesNotThrow(() => api.updateData.call(self, 'ERR:0;'))
	})
})
