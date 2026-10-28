'use client'
import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Check } from 'lucide-react'
import { api } from '../../lib/api'

export default function SignupPage() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    const data = new FormData(event.currentTarget)
    if (data.get('password') !== data.get('confirmPassword')) { setError('Passwords do not match.'); setBusy(false); return }
    try { await api.signup({ name: String(data.get('name')), email: String(data.get('email')), password: String(data.get('password')) }); navigate('/app') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the account.') }
    finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-black text-white"><div className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-10"><Link to="/" className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B6CF0] to-[#8B4FC2]"><Bot className="size-5"/></span><span className="font-bold">Intervix <span className="text-[#8B4FC2]">Ai</span></span></Link><div className="my-auto py-12"><Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft className="size-4"/> Back to home</Link><h1 className="text-3xl font-bold">Create your account</h1><p className="mt-2 text-sm text-zinc-500">Your next great interview starts with one practice session.</p><form className="mt-8 space-y-5" onSubmit={submit}><label className="block"><span className="mb-2 block text-sm text-zinc-300">Full name</span><input name="name" required autoComplete="name" placeholder="Your name" className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-[#5B6CF0]"/></label><label className="block"><span className="mb-2 block text-sm text-zinc-300">Email address</span><input name="email" required type="email" autoComplete="email" placeholder="you@example.com" className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-[#5B6CF0]"/></label><label className="block"><span className="mb-2 block text-sm text-zinc-300">Password</span><input name="password" required minLength={8} type="password" autoComplete="new-password" placeholder="At least 8 characters" className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-[#5B6CF0]"/></label><label className="block"><span className="mb-2 block text-sm text-zinc-300">Confirm password</span><input name="confirmPassword" required minLength={8} type="password" autoComplete="new-password" placeholder="Repeat your password" className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-[#5B6CF0]"/></label>{error && <p role="alert" className="text-sm text-red-400">{error}</p>}<button disabled={busy} className="h-11 w-full rounded-xl bg-gradient-to-r from-[#5B6CF0] to-[#8B4FC2] text-sm font-semibold disabled:opacity-60">{busy ? 'Creating account…' : 'Create account'}</button></form><div className="mt-7 space-y-2 text-sm text-zinc-500"><p className="flex items-center gap-2"><Check className="size-4 text-emerald-400"/> Practice in six languages</p><p className="flex items-center gap-2"><Check className="size-4 text-emerald-400"/> Instant, actionable feedback</p></div><p className="mt-8 text-center text-sm text-zinc-500">Already have an account? <Link to="/login" className="text-[#9B8AFB]">Log in</Link></p></div></div></main>
}
