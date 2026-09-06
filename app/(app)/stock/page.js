'use client'
import { Suspense } from 'react'
import { StagePage } from '@/components/across/stage-page'
export default function Page() { return <Suspense fallback={null}><StagePage stageKey="stocks" /></Suspense> }
