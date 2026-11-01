---
title: Sign in & account security
description: How authentication works for database.pizza accounts — passkeys, social sign-in, passwords, magic links, and how to manage sessions.
---

database.pizza supports four ways to sign in. You can use any of them; adding
more than one keeps you from getting locked out.

| Method | Best for | Notes |
| --- | --- | --- |
| **Passkey** | Everyday use | Phishing-resistant, unlocks with your device biometrics or PIN |
| **GitHub / Google** | One-click sign-in | Links only when the provider has verified your email |
| **Password** | Devices or browsers without passkeys | At least 12 characters; checked against breach data when set |
| **Magic link** | Recovery and email-only access | One-time link, expires in 15 minutes |

## Passkeys

A passkey is a credential stored on your device (or in a password manager) and
protected by Face ID, Touch ID, Windows Hello, or a security key. Nothing
secret is sent to database.pizza, and a passkey will not work on a look-alike
domain.

- **Add a passkey:** Account → Security → Passkeys → **Add passkey**.
- **Sign in:** enter your email, choose **Passkey**, and confirm on your device.
- You can register several passkeys — for example a laptop and a phone.

## Social sign-in

GitHub and Google are available when the deployment has configured them. On
first sign-in we create an account from the provider's **verified** email
address. If the address already belongs to a database.pizza account, the
provider is linked to it instead of creating a second account.

If a provider reports an unverified email, we refuse to link automatically.
Sign in with an existing method first, then connect the provider from
**Account → Security → Linked accounts**.

## Passwords

Passwords are a fallback, not the primary method. A password can only be set
while you are signed in, or through a reset link sent to your verified email.

- Minimum length is 12 characters. Long passphrases are encouraged; there are
  no composition rules.
- New passwords are checked against the Have I Been Pwned corpus using
  k-anonymity, so the password itself never leaves the server.
- Setting or changing a password signs out your other sessions.
- Removing your last sign-in method is blocked.

### Reset a password

1. Choose **Password** on the sign-in page, then **Forgot password?**
2. Enter your email. Whether or not an account exists, the response is the same.
3. Open the link within 15 minutes and choose a new password.
4. Every existing session is signed out.

## Magic links

A magic link is a single-use sign-in token sent to your email. It expires in 15
minutes. Treat it like a password: anyone with the link can sign in until it is
used.

## Sessions

**Account → Security → Active sessions** lists every signed-in device with its
address, browser, and start time. Sessions last 14 days. You can sign out any
device other than the one you are using; changing or resetting a password signs
out all the others automatically.

## Account enumeration

Sign-in responses do not reveal whether an email address has an account.
Passkey, password, magic-link, and reset requests all behave the same for known
and unknown addresses. Rate limits apply per address and per account.

## For operators

Provider credentials and the public callback URL are deployment configuration:

```sh
APP_BASE_URL=https://app.database.pizza
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Optional: disable the breach lookup for offline installs.
PASSWORD_BREACH_CHECK=true
```

Register these callback URLs with each provider:

- `https://app.database.pizza/api/auth/oauth/github/callback`
- `https://app.database.pizza/api/auth/oauth/google/callback`

Passwords are stored as argon2id hashes in a separate credential table. OAuth
identities are keyed by the provider's stable subject, never by email.
