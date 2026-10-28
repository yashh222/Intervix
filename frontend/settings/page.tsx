import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Bot, Check, Globe2 } from 'lucide-react'
import { api } from '../lib/api'

export default function SettingsPage() {
  const [language, setLanguage] = useState('English')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.preferences().then(result => setLanguage(result.language)).catch(() => undefined) }, [])
  async function save() {
    setBusy(true); setMessage(''); setError('')
    try { await api.savePreferences(language); setMessage('Interview language saved.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save preferences.') }
    finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-black px-6 py-10 text-white"><div className="mx-auto max-w-2xl"><Link to="/app" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white"><ArrowLeft className="size-4"/> Back to workspace</Link><div className="mt-10 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B6CF0] to-[#8B4FC2]"><Bot className="size-5"/></span><h1 className="text-3xl font-bold">Settings</h1></div><section className="mt-10 rounded-2xl border border-white/10 bg-[#0A0A0F] p-6"><div className="flex items-center gap-3"><Globe2 className="size-5 text-[#9B8AFB]"/><div><h2 className="font-semibold">Language preferences</h2><p className="mt-1 text-sm text-zinc-500">Choose the language Natalie uses during your interview.</p></div></div><label className="mt-7 block text-sm text-zinc-300">Interview language<select value={language} onChange={event=>setLanguage(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#111116] px-3 text-sm">{['English','Hindi','Marathi','Spanish','French','German'].map(item=><option key={item}>{item}</option>)}</select></label>{message&&<p className="mt-4 text-sm text-emerald-400">{message}</p>}{error&&<p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}<button onClick={save} disabled={busy} className="mt-7 flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5B6CF0] to-[#8B4FC2] px-5 py-2.5 text-sm font-semibold disabled:opacity-50"><Check className="size-4"/>{busy?'Saving…':'Save preferences'}</button></section></div></main>
}
