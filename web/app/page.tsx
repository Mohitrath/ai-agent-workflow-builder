"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./providers";
export default function Home() { const { isAuthenticated } = useApp(); const router = useRouter(); useEffect(() => { if (isAuthenticated === true) router.replace("/workflows"); if (isAuthenticated === false) router.replace("/login"); }, [isAuthenticated, router]); return <p style={{padding:24}}>Loading…</p>; }
