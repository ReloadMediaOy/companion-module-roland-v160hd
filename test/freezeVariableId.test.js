'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const variables = require('../src/variables')

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSelf(dataInit) {
	const defs = []
	return Object.assign(Object.create(variables), {
		DATA: Object.assign({}, dataInit),
		MODEL: '',
		VERSION: '',
		TALLYDATA: [],
		CHOICES_OUTPUTSASSIGN: [],
		CHOICES_PGMPVW_SELECT: [],
		log: () => {},
		setVariableDefinitions: (d) => defs.push(...d),
		setVariableValues: () => {},
		_defs: defs,
	})
}

// ── initVariables — freeze variable registration ──────────────────────────────

describe('initVariables — freeze variable is registered with variableId', () => {
	test('freeze definition has variableId: "freeze"', () => {
		const self = makeSelf({})
		self.initVariables()
		const freeze = self._defs.find((d) => d.variableId === 'freeze')
		assert.ok(freeze, 'no definition with variableId "freeze" found')
		assert.equal(freeze.name, 'Freeze On/Off')
	})

	test('no definition uses the wrong key "variableI"', () => {
		const self = makeSelf({})
		self.initVariables()
		const bad = self._defs.find((d) => Object.prototype.hasOwnProperty.call(d, 'variableI'))
		assert.equal(bad, undefined, 'found a definition still using "variableI" key')
	})

	test('every registered definition has a variableId string', () => {
		const self = makeSelf({})
		self.initVariables()
		for (const d of self._defs) {
			assert.ok(
				typeof d.variableId === 'string' && d.variableId.length > 0,
				`definition missing variableId: ${JSON.stringify(d)}`,
			)
		}
	})
})

// ── checkVariables — freeze value update path ─────────────────────────────────

describe('checkVariables — freeze value reaches setVariableValues', () => {
	test('freeze On when DATA.freeze == "01"', () => {
		let captured
		const self = Object.assign(Object.create(variables), {
			DATA: { freeze: '01' },
			MODEL: '',
			VERSION: '',
			TALLYDATA: [],
			CHOICES_OUTPUTSASSIGN: [],
			CHOICES_PGMPVW_SELECT: [],
			log: () => {},
			setVariableDefinitions: () => {},
			setVariableValues: (obj) => {
				captured = obj
			},
		})
		self.checkVariables()
		assert.equal(captured.freeze, 'On')
	})

	test('freeze Off when DATA.freeze == "00"', () => {
		let captured
		const self = Object.assign(Object.create(variables), {
			DATA: { freeze: '00' },
			MODEL: '',
			VERSION: '',
			TALLYDATA: [],
			CHOICES_OUTPUTSASSIGN: [],
			CHOICES_PGMPVW_SELECT: [],
			log: () => {},
			setVariableDefinitions: () => {},
			setVariableValues: (obj) => {
				captured = obj
			},
		})
		self.checkVariables()
		assert.equal(captured.freeze, 'Off')
	})

	test('freeze Off when DATA.freeze is undefined', () => {
		let captured
		const self = Object.assign(Object.create(variables), {
			DATA: {},
			MODEL: '',
			VERSION: '',
			TALLYDATA: [],
			CHOICES_OUTPUTSASSIGN: [],
			CHOICES_PGMPVW_SELECT: [],
			log: () => {},
			setVariableDefinitions: () => {},
			setVariableValues: (obj) => {
				captured = obj
			},
		})
		self.checkVariables()
		assert.equal(captured.freeze, 'Off')
	})
})
