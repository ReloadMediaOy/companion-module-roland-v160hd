module.exports = [
	function (context, props) {
		return {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}
	},
	// Migrate feedbacks saved with a pre-fix invalid default option value.
	// auxTally/auxMute/auxLink's `aux` option previously defaulted to '11',
	// which is not one of the dropdown's own choices ('aux1'/'aux2'/'aux3'),
	// so any button saved before the default was corrected always evaluates
	// false. Same issue for pnpKeySource's `pinp` option, previously
	// defaulting to '1B' instead of one of 'pnpkey1'..'pnpkey4'.
	//
	// Does NOT touch keyOnAir's own `pinp` option: it is a different
	// feedback with a different, still-valid choice set ('1B'/'1C'/'1D'/'1E'
	// are real protocol values there, not stale defaults).
	function (context, props) {
		const updatedFeedbacks = []

		for (const feedback of props.feedbacks) {
			let changed = false

			if (
				(feedback.feedbackId === 'auxTally' ||
					feedback.feedbackId === 'auxMute' ||
					feedback.feedbackId === 'auxLink') &&
				feedback.options.aux === '11'
			) {
				feedback.options.aux = 'aux1'
				changed = true
			} else if (feedback.feedbackId === 'pnpKeySource' && feedback.options.pinp === '1B') {
				feedback.options.pinp = 'pnpkey1'
				changed = true
			}

			if (changed) {
				updatedFeedbacks.push(feedback)
			}
		}

		return {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks,
		}
	},
	// Migrate actions saved with freezeSwitchSelectEnableDisable's pre-fix
	// invalid numeric default. Its `enable` option previously defaulted to
	// the number 1, not the string '01' the dropdown's own choices use
	// ('00'/'01') and the protocol write expects — any button saved before
	// the default was corrected sends the number 1 instead of the hex
	// string '01' as the DTH value. Only a bare numeric 1 or 0 is migrated;
	// an already-correct string, any other value, the `input` selection,
	// other options, other actions, feedbacks and config are untouched.
	function (context, props) {
		const updatedActions = []

		for (const action of props.actions) {
			if (action.actionId !== 'freezeSwitchSelectEnableDisable') continue

			if (action.options.enable === 1) {
				action.options.enable = '01'
				updatedActions.push(action)
			} else if (action.options.enable === 0) {
				action.options.enable = '00'
				updatedActions.push(action)
			}
		}

		return {
			updatedConfig: null,
			updatedActions,
			updatedFeedbacks: [],
		}
	},
]
