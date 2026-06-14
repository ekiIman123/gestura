export const GESTURE_EMOJI: Record<string, string> = {
  Thumb_Up:     '👍',
  Thumb_Down:   '👎',
  Open_Palm:    '🖐',
  Closed_Fist:  '✊',
  Victory:      '✌️',
  Pointing_Up:  '☝️',
  ILoveYou:     '🤟',
}

export const GESTURE_LABEL: Record<string, string> = {
  Thumb_Up:     'Thumb Up',
  Thumb_Down:   'Thumb Down',
  Open_Palm:    'Open Palm',
  Closed_Fist:  'Fist',
  Victory:      'Victory',
  Pointing_Up:  'Pointing',
  ILoveYou:     'I Love You',
}

export const GESTURE_PROMPTS: Record<string, string> = {
  Thumb_Up:
    'Berikan 1-2 kalimat kata-kata semangat dan penyemangat yang energik dan positif dalam bahasa Indonesia informal.',
  Thumb_Down:
    'Berikan 1-2 kalimat penghiburan yang empatik dan hangat dalam bahasa Indonesia informal, lalu ajak bangkit.',
  Open_Palm:
    'Sapa dengan ramah dan hangat dalam bahasa Indonesia informal, seperti bertemu sahabat lama.',
  Closed_Fist:
    'Berikan 1-2 kalimat kata-kata motivasi yang kuat dan bertenaga dalam bahasa Indonesia informal.',
  Victory:
    'Ceritakan satu fun fact unik dan mengejutkan dalam bahasa Indonesia informal, singkat dan menarik.',
  Pointing_Up:
    'Berikan satu tips atau life hack produktivitas yang praktis dan berguna dalam bahasa Indonesia informal.',
  ILoveYou:
    'Ungkapkan rasa kasih sayang dan apresiasi yang hangat dan tulus dalam bahasa Indonesia informal.',
}

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17], [0, 17],
]
