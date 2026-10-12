import React from 'react';
import { NavLink } from 'react-router-dom';
import '../styles/staticPages.css';

const TermsOfService = () => {
  return (
    <div className="static-page">
      <div className="static-page-content">
        <h1>Terms of Service</h1>
        <p className="last-updated">Last updated: September 30, 2026</p>

        <section className="terms-section">
          <h2>1. Acceptance of Terms</h2>
          <p>These terms govern your use of Chatty Books on the web and in our iPhone, iPad and Android apps (the "Service"), provided by Hayden Bulk Tech Labs Inc. ("we", "our", or "us"). By creating an account or using the Service, you agree to these terms and to our <NavLink to="/privacy">Privacy Policy</NavLink>. If you do not agree, please do not use the Service.</p>
        </section>

        <section className="terms-section">
          <h2>2. The Service</h2>
          <p>Chatty Books is an interactive reading platform. You can read books, listen to narrated audiobooks, talk with AI-generated versions of book characters by text or voice, and browse and contribute to a community gallery of illustrated scenes.</p>
        </section>

        <section className="terms-section">
          <h2>3. Eligibility and Accounts</h2>
          <ul>
            <li>You must be at least 13 years old to use the Service. If you are under 18, you need a parent or guardian’s permission, and they are responsible for your use.</li>
            <li>You’re responsible for keeping your login secure and for activity on your account. Give accurate information and keep it current.</li>
            <li>You can delete your account at any time in the app (Settings → Delete account) or at <NavLink to="/delete-account">chattybooks.com/#/delete-account</NavLink>.</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>4. AI Characters</h2>
          <p>Character replies, voices and generated scenes are produced by artificial intelligence. They are fictional interpretations, not the views of any author, publisher or real person, and they can be inaccurate, inconsistent or unexpected. Don’t rely on them for facts or for medical, legal, financial or other professional advice. Your messages are processed by our AI providers as described in the <NavLink to="/privacy">Privacy Policy</NavLink>.</p>
        </section>

        <section className="terms-section">
          <h2>5. Community Rules</h2>
          <p>We have zero tolerance for objectionable content or abusive users. When you post scenes or comments, or talk with characters, you agree not to:</p>
          <ul>
            <li>Post or try to generate sexual content involving minors, or sexually explicit content in the community gallery</li>
            <li>Harass, bully, threaten or impersonate anyone, or share someone else’s private information</li>
            <li>Post hate speech or content that promotes violence, self-harm or illegal activity</li>
            <li>Spam, scam, or post content that infringes someone else’s rights</li>
            <li>Try to break, overload, reverse-engineer or bypass the Service’s limits or safety measures</li>
          </ul>
          <p>You can report content and block other readers in the app. We review reports within 24 hours and may remove content and suspend or terminate accounts that break these rules, without refund.</p>
        </section>

        <section className="terms-section">
          <h2>6. Your Content</h2>
          <p>You own what you post and the prompts you write. By publishing a scene or comment to the community gallery, you give us a worldwide, non-exclusive, royalty-free license to host, display, reproduce and distribute it within the Service and in promoting Chatty Books, until you delete it or your account. You’re responsible for having the rights to anything you post.</p>
        </section>

        <section className="terms-section">
          <h2>7. Subscriptions and Tokens</h2>
          <ul>
            <li><strong>Tokens</strong> are used for character conversations and scene illustrations. They have no cash value, can’t be transferred or exchanged, and are forfeited when your account is deleted. Each plan comes with a monthly allowance; on renewal your balance resets to the plan’s allowance, and unused tokens do not roll over.</li>
            <li><strong>Paid plans</strong> are monthly subscriptions that renew automatically until cancelled. Prices are shown before you buy.</li>
            <li><strong>In the iPhone and iPad app</strong>, payment is charged to your Apple ID at confirmation of purchase. The subscription renews unless cancelled at least 24 hours before the end of the current period, and your account is charged for renewal within 24 hours before the period ends. Manage or cancel it in your App Store account settings. Refunds are handled by Apple.</li>
            <li><strong>In the Android app</strong>, subscriptions are billed through Google Play and can be managed or cancelled in the Play Store. Refunds are handled under Google Play’s policies.</li>
            <li><strong>In the Seeker app</strong> (Solana dApp Store), you can buy a 30-day plan pass with USDC, SOL or SKR from your own Solana wallet. A pass is a one-time purchase that does not renew. SOL and SKR prices are converted from the US dollar price at the time of purchase. Blockchain transactions can’t be reversed, so passes aren’t refunded except where required by law. You’re responsible for your wallet, its keys and network fees; we never have access to your wallet.</li>
            <li><strong>On the web</strong>, subscriptions are billed by card through Stripe. When you cancel, you won’t be charged again and you keep your plan until the end of the period you’ve paid for; after that your account moves to the free plan. You can undo a cancellation before the period ends. Partial months aren’t refunded except where required by law.</li>
            <li>A subscription must be managed with the store or service it was bought through. Deleting your account doesn’t cancel an App Store or Google Play subscription.</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>8. Intellectual Property</h2>
          <p>Many books in our catalogue are in the public domain; other titles are used with permission. The Chatty Books name, logo, app, design, narration, character profiles and other material we provide are owned by us or our licensors. We give you a personal, non-exclusive, non-transferable license to use the Service for your own non-commercial enjoyment. Don’t copy, resell or redistribute our material outside the Service.</p>
        </section>

        <section className="terms-section">
          <h2>9. App Stores</h2>
          <p>If you use our iPhone or iPad app, Apple’s <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer">Standard End User License Agreement</a> governs your license to the app, alongside these terms. These terms are between you and us, not Apple or Google; they aren’t responsible for the Service or its content, or for maintenance and support, and they have no obligation to handle claims about it. Apple and its subsidiaries are third-party beneficiaries of these terms for the iOS app and may enforce them.</p>
          <p>If you use our Seeker app from the Solana dApp Store, these terms are the end-user license agreement for that app. Solana Mobile isn’t responsible for the Service or its content.</p>
        </section>

        <section className="terms-section">
          <h2>10. Disclaimers and Limitation of Liability</h2>
          <p>The Service is provided "as is" and "as available", without warranties of any kind, express or implied, to the fullest extent permitted by law. We don’t guarantee that the Service will be uninterrupted, error-free, or that AI output will be accurate or appropriate. To the fullest extent permitted by law, we are not liable for indirect, incidental, special, consequential or punitive damages, and our total liability for any claim is limited to the amount you paid us in the 12 months before it. Nothing in these terms limits rights you have under consumer protection laws that can’t be waived.</p>
        </section>

        <section className="terms-section">
          <h2>11. Termination</h2>
          <p>You can stop using the Service and delete your account at any time. We may suspend or end access for anyone who breaks these terms or puts other users or the Service at risk.</p>
        </section>

        <section className="terms-section">
          <h2>12. Changes to Terms</h2>
          <p>We may update these terms. We’ll change the date above and tell you about material changes by email or in the Service. Continuing to use the Service after a change means you accept the updated terms.</p>
        </section>

        <section className="terms-section">
          <h2>13. Contact Information</h2>
          <p>For questions about these Terms of Service, please contact us at:</p>
          <p><a href="mailto:support@chattybooks.com">support@chattybooks.com</a></p>
        </section>
      </div>
    </div>
  );
};

export default TermsOfService;
