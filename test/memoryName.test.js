'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// Inject a minimal @companion-module/base stub before api.js is loaded so
// the broken node_modules chain (ajv, etc.) is never walked.
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

// Minimal self mock — only the fields that updateData touches in the '60' path.
function makeSelf() {
	const captured = {}
	return {
		config: { verbose: false },
		DATA: {},
		log: () => {},
		logVerbose: () => {},
		setVariableValues: (obj) => Object.assign(captured, obj),
		checkFeedbacks: () => {},
		checkVariables: () => {},
		CHOICES_PNPKEY_SOURCES: [],
		_captured: captured,
	}
}

// Feed memory-name DTH bytes for a given memory slot.
// bytes is an array of integer byte values (0-255), one per character position.
function feedBytes(self, memNum, bytes) {
	for (let i = 0; i < bytes.length; i++) {
		const hexMem = memNum.toString(16).padStart(2, '0').toUpperCase()
		const hexIdx = i.toString(16).padStart(2, '0').toUpperCase()
		const hexVal = bytes[i].toString(16).padStart(2, '0').toUpperCase()
		api.updateData.call(self, `DTH:60${hexMem}${hexIdx},${hexVal};`)
	}
}

describe('memory name NUL termination', () => {
	test('NUL padding bytes are stripped — variable shows only the readable name', () => {
		const self = makeSelf()
		// "ABC" + 5 NUL padding bytes (8-byte field)
		feedBytes(self, 0, [0x41, 0x42, 0x43, 0x00, 0x00, 0x00, 0x00, 0x00])
		assert.equal(self._captured['memoryname_1'], 'ABC')
	})

	test('a fully NUL field shows as an empty string', () => {
		const self = makeSelf()
		feedBytes(self, 0, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
		assert.equal(self._captured['memoryname_1'], '')
	})

	test('a full 8-character name with no NUL bytes is preserved intact', () => {
		const self = makeSelf()
		// "ABCDEFGH" — 8 chars, no NUL
		feedBytes(self, 0, [0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48])
		assert.equal(self._captured['memoryname_1'], 'ABCDEFGH')
	})

	test('NUL in the middle terminates the name at that position', () => {
		const self = makeSelf()
		feedBytes(self, 0, [0x41, 0x00, 0x43, 0x44, 0x00, 0x00, 0x00, 0x00])
		assert.equal(self._captured['memoryname_1'], 'A')
	})

	test('bytes arriving out of order still produce the correct name', () => {
		const self = makeSelf()
		// Send "ABC\0\0\0\0\0" out of order: index 2, 0, 1, then padding
		const bytes = [0x41, 0x42, 0x43, 0x00, 0x00, 0x00, 0x00, 0x00]
		const order = [2, 0, 1, 3, 4, 5, 6, 7]
		for (const i of order) {
			const hexMem = '00'
			const hexIdx = i.toString(16).padStart(2, '0').toUpperCase()
			const hexVal = bytes[i].toString(16).padStart(2, '0').toUpperCase()
			api.updateData.call(self, `DTH:60${hexMem}${hexIdx},${hexVal};`)
		}
		assert.equal(self._captured['memoryname_1'], 'ABC')
	})

	test('memory slot index maps to the correct variable name (slot 0 → memoryname_1)', () => {
		const self = makeSelf()
		feedBytes(self, 0, [0x58, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
		assert.equal(self._captured['memoryname_1'], 'X')
		assert.equal(self._captured['memoryname_2'], undefined)
	})
})
