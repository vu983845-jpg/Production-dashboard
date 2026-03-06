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

        // The secret is valid, bypass password check and create a session for this user
        const adminSupabase = await createAdminClient()

        // 1. Get the user by email using the admin api
        const { data: usersData, error: userError } = await adminSupabase.auth.admin.listUsers()

        if (userError) {
            console.error('Error fetching users:', userError)
            return NextResponse.json(
                { error: 'Server error verifying user' },
                { status: 500 }
            )
        }

        // Find the user with this email
        const user = usersData.users.find(u => u.email === email)

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // 2. We now need to sign the user in.
        // There is no direct "impersonate" or "create session" admin method that sets cookies in newer supabase-js easily.
        // We will generate an OTP / Magic Link programatically using admin API, then exchange it immediately to log the user in.
        const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
            type: 'magiclink',
            email: email,
        })

        if (linkError || !linkData?.properties?.action_link) {
            console.error('Error generating auth link:', linkError)
            return NextResponse.json(
                { error: 'Could not generate session' },
                { status: 500 }
            )
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
