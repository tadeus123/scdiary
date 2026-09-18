// Original English lines for the speed-typing sprint. Not a public typing-test corpus.
const PHRASES = [
  'The kettle clicked off before the toast was even warm.',
  'She left the window open so the rain could argue with the floor.',
  'A bicycle leaned on a shop that had already closed for lunch.',
  'He counted the stairs twice and still missed the last one.',
  'The bus doors sighed and then refused to close on time.',
  'I wrote the address on my hand and washed it off by noon.',
  'A stray cat claimed the sunny half of the doorstep.',
  'The printer jammed on the only page that actually mattered.',
  'We waited for the light even though the street was empty.',
  'She folded the map until the river disappeared.',
  'The bakery sold out of rye and pretended not to notice.',
  'He practiced the sentence under his breath on the stairs.',
  'A paper cup rolled in a circle and would not fall over.',
  'The clock in the hallway ran three minutes ahead on purpose.',
  'I packed a book I would not open and a pen I would lose.',
  'The elevator skipped our floor as if it had better plans.',
  'She tapped the microphone and the room became very quiet.',
  'A wet umbrella dripped a small map onto the tiles.',
  'He swore the shortcut was shorter until we reached the hill.',
  'The last train smelled like rain and someone else’s coffee.',
  'I kept the receipt because the date felt like proof.',
  'The shop bell rang for a customer who had already left.',
  'She named the houseplant after a city she had never seen.',
  'A moth drew circles around a lamp that was barely on.',
  'He stacked the plates too high and then walked very slowly.',
  'The sidewalk chalk survived one night and none of the morning.',
  'I heard the neighbors laugh through a wall that was too thin.',
  'The ferry horn arrived a second before the ferry did.',
  'She tied a knot that looked right and then tied another.',
  'A single orange sat in the bowl like it was waiting.',
  'He checked the lock, then the lock, then the lock again.',
  'The library stamp made a sound too loud for the room.',
  'I missed the turn because the sign was facing the wrong way.',
  'The old radio found a station between two other stations.',
  'She wrote faster when she stopped trying to write well.',
  'A pigeon inspected our lunch as if it had paid for it.',
  'The night bus lights made everyone look slightly unfinished.',
  'He left a note that said wait and then did not wait.',
  'The wooden chair creaked in a key I almost recognized.',
  'I practiced typing until the keys felt like a path.',
];

function shuffledPhrases() {
  const copy = PHRASES.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

module.exports = { PHRASES, shuffledPhrases };
