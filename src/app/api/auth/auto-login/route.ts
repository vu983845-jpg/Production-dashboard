import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
    try {
        const { token } = await request.json()

        if (!token) {
            return NextResponse.json(
                { error: 'Missing token' },
                { status: 400 }
            )
        }

        // Decode the base64 token
        const decodedToken = Buffer.from(token, 'base64').toString('utf-8')

        // Find the last colon in case email has one (unlikely but safe)
        const lastColonIdx = decodedToken.lastIndexOf(':')

        if (lastColonIdx === -1) {
            return NextResponse.json(
                { error: 'Invalid token format' },
                { status: 400 }
            )
        }

        const email = decodedToken.substring(0, lastColonIdx)
        const secret = decodedToken.substring(lastColonIdx + 1)

        // Verify the secret matches our server's SSO secret
        if (secret !== process.env.SSO_SECRET_KEY) {
            console.error('SSO Login attempt failed: Invalid Secret Key')
            return NextResponse.json(
                { error: 'Unauthorized: Invalid secret key' },
                { status: 401 }
            )
        }

        // The secret is valid — generate magic link directly.
        // Skipping listUsers() to avoid pagination issues (default page size = 50 users).
        // generateLink will fail if the user doesn't exist, which we handle below.
        const adminSupabase = await createAdminClient()

        const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
            type: 'magiclink',
            email: email,
        })

        if (linkError || !linkData?.properties?.action_link) {
            console.error('Error generating auth link:', linkError)
            // Supabase returns 422 when user is not found
            const status = linkError?.status === 422 ? 404 : 500
            const message = status === 404 ? 'User not found' : 'Could not generate session'
            return NextResponse.json({ error: message }, { status })
        }

        // Return the action link back to the browser so it can establish the session
        return NextResponse.json({ success: true, redirectUrl: linkData.properties.action_link })

    } catch (error) {
        console.error('SSO error processing request:', error)
        return NextResponse.json(
            { error: 'Internal server error while processing SSO' },
            { status: 500 }
        )
    }
}
