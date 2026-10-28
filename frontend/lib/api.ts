export type User = { id: number; name: string; email: string }
export type Feedback = { subject: string; candidate_score: number; feedback: string; areas_of_improvement: string }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'include' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export const api = {
  signup: (input: { name: string; email: string; password: string }) => request<{ user: User }>('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) => request<{ user: User }>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  me: () => request<{ user: User | null }>('/api/auth/me'),
  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  topics: () => request<{ topics: string[] }>('/api/topics'),
  preferences: () => request<{ language: string; voiceAccent: string }>('/api/preferences'),
  savePreferences: (language: string, voiceAccent?: string) => request('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language, voiceAccent }) }),
  uploadResume: (file: File) => { const data = new FormData(); data.append('resume', file); return request<{ filename: string; personalized: boolean }>('/api/resume', { method: 'POST', body: data }) },
  startInterview: (subject: string, language: string, voiceAccent?: string) => fetch('/api/start-interview', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, language, voiceAccent }) }),
  submitAnswer: (audio: Blob) => { const data = new FormData(); data.append('audio', audio, 'answer.webm'); return fetch('/api/submit-answer', { method: 'POST', credentials: 'include', body: data }) },
  feedback: () => request<{ success: boolean; feedback: Feedback }>('/api/get-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
}

export async function playAudioStream(response: Response, done: (complete: boolean, question: string | null) => void) {
  if (!response.ok || !response.body) throw new Error('The interview service did not return audio.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  const buffered: Uint8Array[] = []
  const useMediaSource = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg')
  const mediaSource = useMediaSource ? new MediaSource() : null
  const audio = new Audio(mediaSource ? URL.createObjectURL(mediaSource) : '')
  let sourceBuffer: SourceBuffer | null = null
  const queue: Uint8Array[] = []
  let streamEnded = false
  let resolveOpen: (() => void) | undefined
  const opened = mediaSource ? new Promise<void>(resolve => { resolveOpen = resolve }) : Promise.resolve()
  if (mediaSource) mediaSource.addEventListener('sourceopen', () => {
    sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg')
    sourceBuffer.addEventListener('updateend', () => {
      if (queue.length && !sourceBuffer?.updating) sourceBuffer?.appendBuffer(queue.shift()!)
      else if (streamEnded && !queue.length && !sourceBuffer?.updating && mediaSource.readyState === 'open') mediaSource.endOfStream()
    })
    resolveOpen?.()
  }, {once:true})
  const append = (bytes: Uint8Array) => {
    if (!mediaSource) { buffered.push(bytes); return }
    if (sourceBuffer && !sourceBuffer.updating && !queue.length) sourceBuffer.appendBuffer(bytes)
    else queue.push(bytes)
  }
  const enqueueLines = (lines: string[]) => {
    for (const line of lines) if (line.trim()) append(Uint8Array.from(atob(line.trim()), c => c.charCodeAt(0)))
  }
  const playbackEnded = new Promise<void>((resolve, reject) => { audio.onended = () => resolve(); audio.onerror = () => reject(new Error('Could not play interviewer audio.')) })
  if (mediaSource) await opened
  let playbackStarted: Promise<void> = Promise.resolve()
  if (mediaSource) playbackStarted = audio.play()
  while (true) {
    const { value, done: ended } = await reader.read()
    pending += decoder.decode(value, { stream: !ended })
    const lines = pending.split('\n')
    pending = lines.pop() || ''
    enqueueLines(lines)
    if (ended) break
  }
  if (pending.trim()) enqueueLines([pending])
  if (mediaSource) {
    streamEnded = true
    const activeBuffer = sourceBuffer as SourceBuffer | null
    if (activeBuffer && !activeBuffer.updating && !queue.length && mediaSource.readyState === 'open') mediaSource.endOfStream()
  } else {
    audio.src = URL.createObjectURL(new Blob(buffered, {type:'audio/mpeg'}))
    playbackStarted = audio.play()
  }
  await playbackStarted
  await playbackEnded
  if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src)
  done(response.headers.get('X-Interview-Complete') === 'true', response.headers.get('X-Question-Number'))
}
