"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { ISO50001Content } from "./iso-content"

export default function ISO50001Page() {
    const supabase = createClient()
    const [userRole, setUserRole] = useState("")
    const [userEmail, setUserEmail] = useState("")
    const [isReady, setIsReady] = useState(false)

    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setUserEmail(user.email || "")
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("role")
                    .eq("id", user.id)
                    .single()
                if (profile?.role) {
                    setUserRole(profile.role)
                } else {
                    setUserRole(user.user_metadata?.role || "")
                }
            }
            setIsReady(true)
        }
        init()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    if (!isReady) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-6 max-w-7xl">
            <ISO50001Content userRole={userRole} userEmail={userEmail} />
        </div>
    )
}
