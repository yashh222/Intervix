'use client'
import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bot, Clock3, FileText, LayoutDashboard, LogOut, Menu, Mic, Settings, Sparkles, Upload, UserRound, X } from 'lucide-react'
import { api, Feedback, User } from './lib/api'
import { playAudioStream } from './lib/api'

const colors = ['bg-violet-500/15 text-violet-300', 'bg-pink-500/15 text-pink-300', 'bg-yellow-500/15 text-yellow-300', 'bg-blue-500/15 text-blue-300', 'bg-orange-500/15 text-orange-300', 'bg-cyan-500/15 text-cyan-300']
const abbreviations: Record<string,string> = { 'Self Introduction':'SI', 'Generative AI':'GA', Python:'Py', English:'En', HTML:'HT', CSS:'CS' }
const languages = ['English', 'Hindi', 'Marathi', 'Spanish', 'French', 'German']
const voices: Record<string, string> = { English: 'en-US-natalie', Hindi: 'hi-IN-ayushi', Marathi: 'mr-IN-abhilash', Spanish: 'es-ES-natalia', French: 'fr-FR-juliette', German: 'de-DE-natalie' }
const voiceOptions: Record<string, {id:string; label:string}[]> = { ...Object.fromEntries(languages.map(item=>[item,[{id:voices[item],label:`Natalie · ${item}`}]])), English: [{id:'en-US-natalie',label:'Natalie · US English'},{id:'en-UK-ruby',label:'Ruby · UK English'}] }

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [topics, setTopics] = useState(['Self Introduction', 'Generative AI', 'Python', 'English', 'HTML', 'CSS'])
  const [active, setActive] = useState('Self Introduction')
  const [language, setLanguage] = useState('English')
  const [voiceAccent, setVoiceAccent] = useState(voices.English)
  const [mobile, setMobile] = useState(false)
  const [status, setStatus] = useState('Click Start Interview to begin')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recorded, setRecorded] = useState(false)
  const [started, setStarted] = useState(false)
  const [hasInterview, setHasInterview] = useState(false)
  const [question, setQuestion] = useState(1)
  const [resumeName, setResumeName] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let live = true
    api.me().then(({user: restored}) => {
      if (!live) return
      if (!restored) { navigate('/login', {replace:true}); return }
      setUser(restored)
      api.topics().then(data => { if (live && data.topics.length) setTopics(data.topics) }).catch(() => undefined)
      api.preferences().then(data => { if (live) { setLanguage(data.language); setVoiceAccent(data.voiceAccent) } }).catch(() => undefined)
    }).catch(() => navigate('/login', {replace:true}))
    return () => { live = false }
  }, [navigate])

  async function play(response: Response) {
    let completed = false
    setSpeaking(true); setStatus('Natalie is speaking…')
    try {
      await playAudioStream(response, (complete, number) => {
        if (number) setQuestion(Number(number))
        if (complete) { completed = true; setStarted(false); setStatus('Interview complete. Generate your feedback below.') }
      })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Audio playback failed.') }
    finally { setSpeaking(false); if (started && !completed) setStatus('Your turn — record an answer or end the interview.') }
  }

  async function startInterview() {
    setError(''); setBusy(true); setFeedback(null); setRecorded(false); chunks.current=[]; setQuestion(1); setStatus('Connecting to your interviewer…')
    try { const response = await api.startInterview(active, language, voiceAccent); if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Could not start the interview.') } setStarted(true); setHasInterview(true); await play(response) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start the interview.'); setStatus('Unable to connect.') }
    finally { setBusy(false) }
  }

  async function toggleRecording() {
    setError('')
    if (recording) { recorder.current?.stop(); setRecording(false); setStatus('Recording ready to submit.'); return }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setError('Audio recording is not supported in this browser.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true})
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const media = new MediaRecorder(stream, {mimeType}); chunks.current = []
      media.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data) }
      media.onstop = () => { stream.getTracks().forEach(track => track.stop()); setRecorded(chunks.current.length > 0) }
      recorder.current = media; media.start(); setRecording(true); setStatus('Recording your answer…')
    } catch (reason) {
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow microphone access in your browser settings and try again.' : 'Could not access your microphone. Check that a microphone is connected.')
    }
  }

  async function submitAnswer() {
    const answer = new Blob(chunks.current, {type:'audio/webm'})
    if (!answer.size) { setError('Record an answer before submitting.'); return }
    setBusy(true); setStatus('Transcribing and preparing the next question…'); setError('')
    try { const response = await api.submitAnswer(answer); if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Could not submit your answer.') } chunks.current = []; setRecorded(false); await play(response) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit your answer.') }
    finally { setBusy(false) }
  }

  async function getFeedback() {
    setBusy(true); setError(''); setStatus('Generating interview feedback…')
    try { const result = await api.feedback(); setFeedback(result.feedback); setStatus('Your interview feedback is ready.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Feedback generation failed.') }
    finally { setBusy(false) }
  }

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return
    setError('')
    try { const result = await api.uploadResume(file); setResumeName(result.filename); setStatus(result.personalized ? 'Resume uploaded and ready to personalize questions.' : 'Resume uploaded. PDF and DOCX text extraction is not configured yet.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Resume upload failed.') }
    event.target.value = ''
  }

  async function logout() { await api.logout().catch(() => undefined); navigate('/login', {replace:true}) }
  async function changeLanguage(value: string) { setLanguage(value); setVoiceAccent(voices[value]); try { await api.savePreferences(value, voices[value]) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save language preference.') } }
  async function changeVoice(value: string) { setVoiceAccent(value); try { await api.savePreferences(language, value) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save voice preference.') } }

  return <main className="min-h-screen bg-black text-white">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[300px] flex-col border-r border-white/[0.08] bg-[#0A0A0F] p-6 transition-transform lg:translate-x-0 ${mobile?'translate-x-0':'-translate-x-full'}`}>
      <div className="flex items-center justify-between"><Link to="/" className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B6CF0] to-[#8B4FC2]"><Bot className="size-5"/></span><span className="font-bold">Intervix <span className="text-[#8B4FC2]">Ai</span></span></Link><button className="lg:hidden" onClick={()=>setMobile(false)} aria-label="Close menu"><X className="size-5"/></button></div>
      <div className="mt-14"><p className="mb-4 text-[10px] font-bold tracking-[0.2em] text-zinc-600">SELECT TOPIC</p><div className="space-y-2">{topics.map((name,index)=><button onClick={()=>{setActive(name);setStarted(false);setHasInterview(false);setRecorded(false);setFeedback(null)}} key={name} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm transition ${active===name?'bg-gradient-to-r from-[#5B6CF0] to-[#8B4FC2] shadow-lg shadow-[#5B6CF0]/20':'bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-white'}`}><span className={`flex size-9 items-center justify-center rounded-lg text-xs font-bold ${colors[index%colors.length]}`}>{abbreviations[name] || name.slice(0,2)}</span>{name}</button>)}</div></div>
      <div className="my-8 h-px bg-white/[0.08]"/><p className="mb-4 text-[10px] font-bold tracking-[0.2em] text-zinc-600">CUSTOM PRACTICE</p><input ref={fileInput} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={uploadResume}/><button onClick={()=>fileInput.current?.click()} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/15 p-3 text-left text-sm text-zinc-400 hover:border-[#5B6CF0] hover:text-white"><span className="flex size-9 items-center justify-center rounded-lg bg-white/[0.05]"><Upload className="size-4"/></span>{resumeName || 'Upload resume'}</button>
      <div className="mt-auto pt-10"><Link to="/settings" className="flex items-center gap-3 rounded-xl p-3 text-sm text-zinc-500 hover:bg-white/[0.05] hover:text-white"><Settings className="size-4"/> Settings</Link></div>
    </aside>
    {mobile&&<div onClick={()=>setMobile(false)} className="fixed inset-0 z-30 bg-black/60 lg:hidden"/>}
    <section className="min-h-screen lg:pl-[300px]"><header className="flex h-20 items-center justify-between border-b border-white/[0.08] px-6 lg:px-10"><button onClick={()=>setMobile(true)} className="lg:hidden" aria-label="Open menu"><Menu className="size-5"/></button><div className="hidden text-sm text-zinc-500 lg:block">Interview workspace <span className="mx-2 text-zinc-700">/</span> Practice</div><div className="ml-auto flex items-center gap-4"><span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-sm font-bold">{user?.name?.slice(0,1).toUpperCase() || <UserRound className="size-4"/>}</span><span className="hidden text-sm sm:block">{user?.name || 'Loading…'}</span><button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"><LogOut className="size-4"/><span className="hidden sm:inline">Log out</span></button></div></header>
      <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="mb-4 flex items-center gap-2 text-xs font-semibold text-[#9B8AFB]"><Sparkles className="size-3.5"/> AI INTERVIEW PRACTICE</p><h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Master your <span className="bg-gradient-to-r from-[#5B6CF0] to-[#B467DB] bg-clip-text text-transparent">interview.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-zinc-500">Practice with Natalie, your AI interviewer. Choose a topic and start a conversation that feels like the real thing.</p></div><div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-right"><p className="text-xs text-zinc-500">Current topic</p><p className="mt-1 text-sm font-semibold">{active}</p></div></div>
      <div className="mt-10 flex items-center gap-4"><div className="flex size-11 items-center justify-center rounded-xl bg-violet-500/15 text-sm font-bold text-violet-300">{abbreviations[active] || 'AI'}</div><div><p className="text-sm font-semibold">{active}</p><p className="text-xs text-zinc-500">5 questions · Personalized practice</p></div><div className="ml-auto hidden text-xs text-zinc-500 sm:block">Question {question} of 5</div></div><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#5B6CF0] to-[#8B4FC2] transition-all" style={{width:`${question*20}%`}}/></div>
      <div className="mt-8 rounded-3xl border border-white/[0.08] bg-[#0A0A0F] p-6 sm:p-8"><div className="flex flex-col items-center justify-between gap-6 sm:flex-row"><div className="flex items-center gap-4"><div className="relative flex size-20 items-center justify-center rounded-full border border-[#5B6CF0]/30 bg-gradient-to-br from-[#5B6CF0]/20 to-[#8B4FC2]/20"><img src="/natalie.png" alt="Natalie, AI interviewer" className="size-14 rounded-full object-cover" /><span className={`absolute bottom-0 right-0 size-4 rounded-full border-2 border-[#0A0A0F] ${speaking?'animate-pulse bg-violet-400':'bg-emerald-400'}`}/></div><div><p className="text-lg font-semibold">Natalie</p><p className="text-sm text-zinc-500">AI Interviewer</p></div></div><div className="flex flex-wrap items-center justify-center gap-3"><label className="sr-only" htmlFor="language">Interview language</label><select id="language" value={language} onChange={event=>changeLanguage(event.target.value)} disabled={started} className="rounded-full border border-white/10 bg-[#111116] px-4 py-2.5 text-sm text-zinc-300 outline-none">{languages.map(item=><option key={item}>{item}</option>)}</select><label className="sr-only" htmlFor="voice-accent">Voice accent</label><select id="voice-accent" aria-label="Voice accent" value={voiceAccent} onChange={event=>changeVoice(event.target.value)} disabled={started} className="rounded-full border border-white/10 bg-[#111116] px-4 py-2.5 text-sm text-zinc-300 outline-none">{voiceOptions[language].map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>{!started?<button onClick={startInterview} disabled={busy} className="rounded-full bg-gradient-to-r from-[#5B6CF0] to-[#8B4FC2] px-5 py-2.5 text-sm font-semibold shadow-lg shadow-[#5B6CF0]/20 disabled:opacity-50">{busy?'Connecting…':'Start interview'}</button>:<><button onClick={toggleRecording} disabled={busy||speaking} className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold ${recording?'bg-red-500 text-white':'bg-gradient-to-r from-[#5B6CF0] to-[#8B4FC2]'} disabled:opacity-50`}><Mic className="size-4"/>{recording?'Stop recording':'Record answer'}</button>{recorded&&!recording&&<button onClick={submitAnswer} disabled={busy||speaking} className="rounded-full border border-white/15 px-4 py-2.5 text-sm disabled:opacity-50">Submit answer</button>}</>}</div></div>
      <div className="mt-8 border-t border-white/10 pt-7 text-center"><p className="text-sm text-zinc-400">{status}</p>{error&&<p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}{started&&<div className="mt-5 flex flex-wrap justify-center gap-3"><div className="flex items-center justify-center gap-1.5 py-3">{[10,22,34,18,28,14,24,10,18,30,16].map((height,index)=><span key={index} className={`w-1 rounded-full bg-[#8B4FC2] ${speaking?'animate-pulse':''}`} style={{height}}/>)}<span className="ml-3 text-xs text-zinc-500">{speaking?'Natalie is speaking':'Your turn to answer'}</span></div><button onClick={()=>{setStarted(false);setRecording(false);if(recorder.current?.state==='recording') recorder.current.stop();setStatus('Interview ended. Generate your feedback when ready.')}} disabled={busy||recording} className="rounded-full border border-white/10 px-5 py-2 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50">End interview</button></div>}</div>
      </div>
      {started===false&&hasInterview&&!feedback&&<div className="mt-4 flex justify-end gap-3"><button onClick={()=>{setHasInterview(false);setQuestion(1);setStatus('Click Start Interview to begin')}} className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-zinc-300">New interview</button><button onClick={getFeedback} disabled={busy} className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-zinc-300 disabled:opacity-50">{busy?'Generating…':'Get interview feedback'}</button></div>}
      {feedback&&<section className="mt-8 rounded-3xl border border-white/[0.08] bg-[#0A0A0F] p-6 sm:p-8"><div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-violet-500/15"><FileText className="size-5 text-violet-300"/></div><div><p className="text-lg font-semibold">Interview feedback</p><p className="text-sm text-zinc-500">{feedback.subject} · Score {feedback.candidate_score}/5</p></div></div><h3 className="mt-6 font-semibold">What went well</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{feedback.feedback}</p><h3 className="mt-5 font-semibold">Areas to improve</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{feedback.areas_of_improvement}</p></section>}
      <div className="mt-8 grid gap-4 sm:grid-cols-3"><Stat icon={Clock3} label="Practice time" value="—"/><Stat icon={FileText} label="Sessions completed" value="—"/><Stat icon={LayoutDashboard} label="Average score" value="—"/></div></div>
    </section>
  </main>
}
function Stat({icon:Icon,label,value}:{icon:typeof Clock3;label:string;value:string}){return <div className="rounded-2xl border border-white/[0.08] bg-[#0A0A0F] p-5"><Icon className="size-4 text-[#9B8AFB]"/><p className="mt-5 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-zinc-500">{label}</p></div>}
