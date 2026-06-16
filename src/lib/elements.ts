export type ElementType = 'fire' | 'water' | 'air' | 'earth' | 'lightning' | 'energy' | 'spirit'

export const GESTURE_ELEMENT: Record<string, ElementType> = {
  Thumb_Up:    'fire',
  Thumb_Down:  'water',
  Open_Palm:   'air',
  Closed_Fist: 'earth',
  Victory:     'lightning',
  Pointing_Up: 'energy',
  ILoveYou:    'spirit',
}

export const ELEMENT_CONFIG: Record<ElementType, {
  label: string
  emoji: string
  colors: string[]
  glow: string
}> = {
  fire:      { label: 'Api',    emoji: '🔥', colors: ['#ff4500','#ff6b35','#ffa500','#ffcc00','#ff2200'], glow: '#ff6b00' },
  water:     { label: 'Air',    emoji: '💧', colors: ['#00b4d8','#0077b6','#48cae4','#90e0ef','#caf0f8'], glow: '#00b4d8' },
  air:       { label: 'Udara',  emoji: '🌪️', colors: ['#b2ebf2','#ffffff','#80deea','#e0f7fa'],           glow: '#80deea' },
  earth:     { label: 'Tanah',  emoji: '🪨', colors: ['#6d4c41','#388e3c','#795548','#8d6e63','#4caf50'], glow: '#8d6e63' },
  lightning: { label: 'Petir',  emoji: '⚡', colors: ['#ffffff','#ffff00','#aa88ff','#ffeeaa'],            glow: '#ffff00' },
  energy:    { label: 'Energi', emoji: '✨', colors: ['#ff44ff','#aa00ff','#ff88ff','#ffffff','#cc44ff'], glow: '#cc44ff' },
  spirit:    { label: 'Roh',    emoji: '💫', colors: ['#ff44aa','#aa00ff','#00ffcc','#ffaa00','#ffffff'], glow: '#ff44aa' },
}
