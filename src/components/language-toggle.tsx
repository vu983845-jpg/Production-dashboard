"use client"

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/contexts/LanguageContext"
import { Globe } from "lucide-react"

export function LanguageToggle() {
    const { language, setLanguage } = useLanguage()

    return (
        <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2 h-9 px-3 rounded-full border-primary/20 text-primary hover:bg-primary/10 transition-colors"
            onClick={() => setLanguage(language === "vi" ? "en" : "vi")}
        >
            <Globe className="h-4 w-4" />
            <span className="font-semibold text-xs tracking-wider">
                {language === "vi" ? "VI" : "EN"}
            </span>
        </Button>
    )
}
