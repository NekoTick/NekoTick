# Privacy Policy

Last updated: July 28, 2026

This Privacy Policy explains how vlaina handles information when you use the vlaina desktop app, website, API, account features, managed AI service, billing features, support/admin systems, and redirect links operated by vlaina.

vlaina is designed first as a local desktop application. You can use local note editing without creating an account. Online features are optional, but when you choose to use them, vlaina and the services we rely on may process the information described below.

This policy describes our current practices and may be updated as the product changes.

## Who We Are

vlaina is operated by vladelaina. For privacy questions or requests, contact us at:

vladelaina@gmail.com

If vlaina is later operated by a company or other legal entity, this policy may be updated to identify that entity.

## Local Data

Your notes, files, workspaces, settings, app preferences, local AI provider configuration, and other local app data are stored on your device unless you choose to connect an online service or use a feature that sends data outside your device.

Files you open or create remain under your control in the folders you choose. vlaina does not require an account for local note editing.

If you configure your own AI provider in the desktop app, your provider settings and API keys are intended to stay on your device. You are responsible for the providers and keys you choose to use.

The desktop app may write local diagnostic or error logs on your device to help troubleshoot crashes or failures. These logs may include app version, platform, error messages, stack traces, URL or route information, and limited runtime diagnostics, but they are not automatically uploaded to vlaina unless you choose to provide them in a support request.

## Account Information

If you sign in or use online features, vlaina may process account information such as:

- Email address.
- Display name.
- Avatar URL or profile image URL.
- Authentication provider or sign-in method, such as Google or email sign-in.
- Provider account identifiers.
- Account creation and update timestamps.
- Authentication status and session status.
- Membership tier, membership status, membership start and expiration times.
- Usage balance and quota-related information for managed AI features.

For email sign-in, we process your email address to send and verify login codes. Login codes are stored as hashes, but the email address, request attempts, expiration time, and related operational metadata may be stored so the sign-in flow, abuse prevention, and support tools can work.

For OAuth sign-in, Google may provide profile information such as your email address, display name, avatar URL, and provider account identifier. Google's own privacy policy applies to its handling of your information.

## Sessions, Security, and Abuse Prevention

vlaina may collect and store security and operational metadata to authenticate users, prevent abuse, diagnose issues, and protect the service. This may include:

- Session token hashes.
- A randomly generated app or browser device identifier. For account session records, vlaina stores only its SHA-256 hash.
- Session creation, expiration, and last-used timestamps.
- IP address.
- User agent.
- Rate-limit counters.
- Authentication errors and verification failures.
- API endpoint, method, status, latency, and error information.

Session tokens are stored as hashes where applicable. Rate-limit records are used to reduce abuse and may be cleaned up automatically after a short period. Other account and security records may be kept as long as needed to provide the service, protect the system, resolve disputes, or comply with legal obligations.

The random device identifier is used to distinguish active sign-in installations, enforce account device limits, and sign out older sessions when the limit is exceeded. It is not derived from hardware serial numbers or other hardware fingerprinting data.

## Managed AI Features

If you use vlaina managed AI features, the content you send to the model, including prompts, messages, selected note content, or other text you include in a request, may be transmitted through vlaina's API to the upstream AI provider or model gateway selected by vlaina so that a response can be generated.

Managed AI requests may be logged with operational metadata, such as:

- User account identifier and account email.
- Model identifier.
- AI channel or upstream provider identifier.
- Request ID.
- Endpoint and request method.
- Upstream status.
- Success, rejection, or error status.
- Error code and bounded error message.
- IP address and user agent.
- Whether the request was streamed.
- Retry count.
- Input, output, and total token counts.
- Usage source.
- Estimated or actual cost metrics.
- Billed usage or points.
- Latency and timestamp.

vlaina does not intentionally store prompt or response content in managed AI audit logs. However, the content you send is transmitted to the upstream AI provider or model gateway to generate the response, and that provider may process or retain it according to its own policies and settings. Request or response content may also be processed temporarily in transit, in error handling, or if you choose to provide it to us in a support request.

Avoid sending sensitive personal information, secrets, credentials, payment information, health information, or other confidential material to AI providers unless you understand and accept the risks.

## Third-Party AI Providers

If you configure a third-party AI provider yourself, your requests may be sent directly from the desktop app or through the configured integration depending on the feature. The provider may receive the content you send, your API key or authentication information, your IP address, and standard network metadata.

You are responsible for reviewing and accepting the privacy practices of any third-party AI provider you configure.

## Billing and Payments

If you subscribe, purchase a membership, buy a top-up, or otherwise use billing features, vlaina may process billing-related information such as:

- User account identifier.
- Email address used for checkout.
- Membership tier.
- Subscription status.
- Checkout type.
- Stripe customer identifier.
- Stripe subscription identifier.
- Stripe checkout session identifier.
- Payment, invoice, charge, refund, and webhook event identifiers.
- Current billing period, cancellation status, refund status, and related timestamps.

Payment processing is handled by Stripe or another payment provider we may use. vlaina does not store your full payment card number in the desktop app. Payment providers may collect and process payment details under their own privacy policies and legal obligations.

## Redirect Links and Website Analytics

vlaina may operate redirect links such as `vlaina.com/r/...`. When you visit one of these links, vlaina may record pseudonymous visit analytics, including:

- Redirect link identifier.
- Timestamp.
- Referrer host.
- Country code provided by the hosting/network platform.
- User agent.
- A pseudonymous visitor key derived from IP address and user agent.

These redirect analytics help us understand whether links and campaigns are working. The visitor key is intended to reduce direct identification, but it may still be considered personal data or online identifier information in some jurisdictions.

## Web, Media, Search, and External Links

If you use features that open links, resolve media URLs, fetch web content, perform web search, check package or model information, or otherwise contact external websites or services, those services may receive information such as:

- The URL requested.
- Your IP address.
- User agent.
- Referrer or browser/network metadata.
- Any content you send to that service.

External websites and services are governed by their own privacy practices.

## Update Checks

vlaina may check GitHub Releases or other update sources to determine whether a newer desktop version is available. This sends a request to the update source and may include standard network metadata such as your IP address and user agent.

Updates are currently offered as downloads. The app does not install updates in the background.

## Admin and Support Access

vlaina includes internal admin tools used to operate the service. Authorized administrators may access account, billing, usage, audit, analytics, model, channel, email template, site settings, and support-related information when needed to:

- Provide and maintain the service.
- Diagnose technical issues.
- Manage memberships and billing status.
- Investigate abuse, fraud, or service reliability problems.
- Understand aggregate usage and service health.
- Respond to support or privacy requests.

Admin access is restricted to authorized maintainers and protected by administrative credentials.

## Data Sharing

We do not sell your personal data. We also do not share personal information for cross-context behavioral advertising as those terms are commonly used under California privacy law.

We may share or transmit information when needed to provide features you choose to use, including with:

- AI providers and model gateways.
- Authentication providers such as Google.
- Email delivery providers for login codes and service emails.
- Payment processors such as Stripe.
- Hosting, database, infrastructure, and security providers.
- External websites or services you ask the app to contact.
- Public software platforms such as GitHub when checking releases or opening repository links.

We may also disclose information if required by law, to protect rights and safety, to investigate abuse or security issues, or in connection with a business transfer.

## Legal Bases for Processing

If privacy laws in your region require a legal basis for processing personal information, we rely on the following bases depending on the context:

- Contract or requested service: to provide the app, account features, managed AI, authentication, billing, support, and features you choose to use.
- Legitimate interests: to secure the service, prevent abuse, debug issues, maintain reliability, understand usage, improve the product, and operate the admin/support systems.
- Consent: where we ask for consent or where you choose to connect optional services or providers.
- Legal obligations: to keep records required for accounting, tax, dispute resolution, compliance, or lawful requests.

Where we rely on legitimate interests, we consider the nature of the data, the impact on users, and the safeguards described in this policy.

## Data Retention

We keep different categories of information for different periods depending on what the information is used for.

- Local notes and app data remain on your device until you delete them or remove the app data.
- Account, membership, billing, and support records may be kept while your account is active and for as long as needed for service operation, accounting, fraud prevention, dispute resolution, legal compliance, or legitimate business purposes.
- Managed AI audit logs are intended for operational monitoring, usage accounting, billing, debugging, and abuse prevention. The service may limit retained audit rows and may also allow authorized administrators to clear audit logs.
- Rate-limit records are short-lived operational records used to protect the service from abuse.
- Redirect link analytics may be retained for service analytics and campaign measurement.

When account-related information is no longer needed, we may delete it, anonymize it, or keep it only as required for security, fraud prevention, accounting, tax, legal compliance, dispute resolution, or legitimate business purposes.

If you want to request deletion of account-related information, contact us using the information below. Some records may need to be retained where required for security, fraud prevention, accounting, legal compliance, or dispute resolution.

## Your Choices

You can use local note editing without signing in.

You can avoid managed online features if you do not want related data to be processed by vlaina's API or upstream services.

You can configure your own AI providers, but you should review their privacy practices before sending data to them.

You can sign out to revoke the current app session. You can also contact us to request help with account access, deletion, or privacy questions.

## Privacy Rights

Depending on where you live, you may have rights to:

- Request access to personal information we hold about you.
- Request correction of inaccurate personal information.
- Request deletion of personal information.
- Object to or restrict certain processing.
- Request a copy of personal information in a portable format.
- Withdraw consent where processing is based on consent.
- Appeal or complain to a privacy regulator where applicable.

To make a privacy request, contact us at `vladelaina@gmail.com`. We may need to verify your identity before fulfilling a request. We will not discriminate against you for exercising privacy rights. Some requests may be limited by security, fraud prevention, accounting, tax, legal compliance, dispute resolution, or technical constraints.

## California Privacy Notice

If California privacy law applies to you, this section provides additional notice.

The categories of personal information vlaina may collect include:

- Identifiers, such as email address, account ID, provider account ID, IP address, user agent, session token hash, hashed random device identifier, Stripe identifiers, and pseudonymous redirect visitor keys.
- Customer records and commercial information, such as membership tier, subscription status, checkout type, billing status, purchases, top-ups, refunds, and related payment processor identifiers.
- Internet or network activity information, such as API endpoint, request method, timestamps, status, latency, rate-limit records, update checks, redirect analytics, and external link or web feature metadata.
- Geolocation-like information at a coarse level, such as country code provided by hosting or network infrastructure for redirect analytics.
- Inferences or usage metrics, such as model usage, token counts, billed usage, quota status, aggregate analytics, and service health metrics.
- User-provided content, when you choose to send prompts, messages, selected note content, support material, or other content to online or AI features.

We use these categories for the purposes described in this policy, including providing the service, authentication, billing, managed AI, support, security, abuse prevention, analytics, service reliability, and legal compliance.

We disclose personal information to the categories of recipients described in the "Data Sharing" section. We do not sell personal information or share it for cross-context behavioral advertising. We do not knowingly sell or share personal information of users under 16.

California residents may have rights to know, access, correct, delete, and opt out of sale or sharing. Because vlaina does not sell or share personal information for cross-context behavioral advertising, there is currently no sale/share opt-out mechanism beyond contacting us with questions.

## Security

We use reasonable technical and organizational safeguards appropriate for the current service, including hashed tokens where applicable, rate limits, restricted admin endpoints, and separation between local app data and online services.

No software, network service, or storage system can be guaranteed to be completely secure. You should avoid sending highly sensitive information through AI or online features unless you understand the risks.

## Children's Privacy

vlaina is not intended for children under 13, or the minimum age required in your jurisdiction to use online services without parental consent. We do not knowingly collect personal information from children below that age. If you believe a child has provided personal information to vlaina, contact us so we can review and take appropriate action.

## International Use

vlaina may be operated from, hosted in, or accessed from different countries. Online features may rely on providers such as hosting, database, payment, authentication, email delivery, AI, and infrastructure providers that process information in the United States or other countries.

By using online features, your information may be processed in countries other than where you live. Where required, we rely on appropriate safeguards provided by our service providers or other lawful transfer mechanisms.

## Changes

We may update this Privacy Policy as vlaina changes. The latest version should be available in this repository or on the official vlaina website.

Material changes will be reflected by updating the "Last updated" date above.

## Contact

For privacy questions or requests, contact:

vladelaina@gmail.com

For non-sensitive project questions, you may also contact the project maintainers through the official repository:

https://github.com/vladelaina/vlaina

Please do not post sensitive personal information, payment details, private account data, or secrets in a public GitHub issue.
