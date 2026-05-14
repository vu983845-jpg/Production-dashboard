export function NeutralLogo({ className = "" }: { className?: string }) {
    return (
        <div className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-500 to-emerald-500 text-white shadow-sm ${className}`}>
            <svg viewBox="0 0 48 48" className="h-2/3 w-2/3" aria-hidden="true">
                <path d="M12 32V18.5L24 12l12 6.5V32L24 38.5 12 32Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
                <path d="M24 12v26.5M12 18.5l12 6.5 12-6.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            </svg>
        </div>
    )
}
