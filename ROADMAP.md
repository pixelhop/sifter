# Podcast Digest - Development Roadmap

## Phase 1: Foundation (Week 1)
**Goal:** Core infrastructure working end-to-end

### 1.1 Database Schema
- [ ] Define Prisma models (User, Podcast, Episode, Clip, Digest)
- [ ] Create database migrations
- [ ] Set up database client utilities

**Verification:** Can create/read/update all models via Prisma Studio

### 1.2 API Skeleton
- [ ] Set up Nitro routes structure
- [ ] Health check endpoint
- [ ] Error handling middleware
- [ ] Environment config validation

**Verification:** `GET /api/health` returns 200 with DB connection status

### 1.3 Workers Setup
- [ ] BullMQ queue configuration
- [ ] Redis connection
- [ ] Example job that runs successfully

**Verification:** Job queues appear in Bull Board dashboard

---

## Phase 2: Podcast Discovery (Week 1-2)
**Goal:** Users can search and subscribe to podcasts

### 2.1 Podcast Search API
- [ ] iTunes search integration
- [ ] Cache search results
- [ ] Return podcast metadata + RSS feed URL

**Verification:** `GET /api/podcasts/search?q=startup` returns podcast list

### 2.2 Subscription System
- [ ] Subscribe to podcast endpoint
- [ ] Store podcast metadata in DB
- [ ] List user's subscriptions

**Verification:** User can subscribe → appears in their list

### 2.3 Frontend - Podcast Search UI
- [ ] Search input with debounce
- [ ] Podcast cards with subscribe button
- [ ] My Subscriptions page

**Verification:** Can search → click subscribe → see in subscriptions

---

## Phase 3: Audio Pipeline (Week 2)
**Goal:** Can download, transcribe, and slice audio

### 3.1 Episode Download
- [ ] RSS feed parser
- [ ] Download MP3 from URL
- [ ] Store in temp storage

**Verification:** Can fetch RSS → download latest episode MP3

### 3.2 Whisper Transcription
- [ ] Whisper API integration
- [ ] Store transcript with timestamps
- [ ] Queue job for transcription

**Verification:** Episode goes from pending → transcribed with full text + timestamps

### 3.3 FFmpeg Clip Slicing
- [ ] FFmpeg wrapper utilities
- [ ] Slice audio by timestamp
- [ ] Add fade in/out

**Verification:** Can pass start/end timestamps → get clipped MP3 with fades

---

## Phase 4: AI Curation (Week 2-3)
**Goal:** AI selects relevant clips from transcripts

### 4.1 GPT-4 Clip Selection
- [ ] Prompt engineering for clip selection
- [ ] Parse GPT response to Clip records
- [ ] Store relevance scores and reasoning

**Verification:** Transcribed episode → analyzed → 3-5 clips created with timestamps

### 4.2 User Interests
- [ ] Add interests to User model
- [ ] Onboarding flow for topic selection
- [ ] Use interests in GPT prompt

**Verification:** User sets interests → GPT uses them for relevance

---

## Phase 5: Digest Generation (Week 3)
**Goal:** Can generate a complete audio digest

### 5.1 AI Narrator Script
- [ ] Script generation prompt
- [ ] Generate intro/outro for each clip
- [ ] Store narrator script in Digest

**Verification:** Clips selected → script generated → makes sense when read

### 5.2 ElevenLabs Integration
- [ ] TTS API integration
- [ ] Generate narrator audio
- [ ] Store audio file

**Verification:** Script → MP3 of AI voice speaking it

### 5.3 Audio Mixing
- [ ] FFmpeg concat all audio pieces
- [ ] Add transitions between clips
- [ ] Final output MP3

**Verification:** All pieces → single mixed MP3 that plays end-to-end

---

## Phase 6: Digest Delivery (Week 3-4)
**Goal:** Users can listen to their digests

### 6.1 Private Podcast Feed
- [ ] Generate RSS feed with auth token
- [ ] Include digest episodes in feed
- [ ] Token-based access control

**Verification:** User gets RSS URL → can subscribe in Apple Podcasts/Spotify

### 6.2 Web Player
- [ ] Digest list page
- [ ] Audio player component
- [ ] Show clips with timestamps

**Verification:** Can play digest in browser, see what's playing

### 6.3 Digest Queue System
- [ ] Schedule digest generation (daily/weekly)
- [ ] Queue digest jobs
- [ ] Notify user when ready

**Verification:** Digest auto-generates on schedule → user gets notification

---

## Phase 7: Polish & Sharing (Week 4)
**Goal:** Production-ready with social features

### 7.1 Auth & User Management
- [ ] Sign up / Login
- [ ] User settings (frequency, voice preference)
- [ ] Password reset

**Verification:** Full auth flow works, settings save

### 7.2 Public Digest Sharing
- [ ] Make digest public toggle
- [ ] Public feed URL
- [ ] Social sharing cards

**Verification:** User enables public → others can subscribe to their curated feed

### 7.3 Error Handling & Retries
- [ ] Failed job retries
- [ ] Dead letter queue
- [ ] User-facing error states

**Verification:** Failed transcription retries 3x → alerts if still failing

---

## Phase 8: Launch Prep (Week 4-5)
**Goal:** Ready for users

### 7.1 Deployment
- [ ] API deployment (Render/Railway)
- [ ] Frontend deployment (Vercel)
- [ ] Database migration
- [ ] S3 bucket for audio

### 7.2 Monitoring
- [ ] Error tracking (Sentry)
- [ ] Usage analytics
- [ ] Cost monitoring (Whisper/ElevenLabs)

### 7.3 Documentation
- [ ] API docs
- [ ] User guide
- [ ] Onboarding flow

---

## Development Order (Prioritized)

### Sprint 1: Core Pipeline
1. Database schema
2. Podcast search/subscribe
3. Download + transcribe (Whisper)
4. GPT clip selection

### Sprint 2: Digest Creation
5. FFmpeg clip slicing
6. AI narrator script
7. ElevenLabs TTS
8. Audio mixing

### Sprint 3: Delivery & Polish
9. Private podcast feed
10. Web app player
11. Auth
12. Public sharing

---

## Verification Checkpoints

After each phase, verify:
- [ ] Can demonstrate the feature end-to-end
- [ ] No console errors
- [ ] Database state is correct
- [ ] Ready for next phase to build on top

## Risk Areas

1. **Audio quality** - May need multiple TTS iterations
2. **GPT clip selection** - Prompt engineering will need tuning
3. **FFmpeg complexity** - Audio mixing edge cases
4. **RSS feed parsing** - Podcasts have inconsistent feeds

## Success Criteria

- [ ] Can subscribe to 5 podcasts
- [ ] Daily digest generates automatically
- [ ] Digest is 10-20 min of listenable audio
- [ ] Can share digest publicly
- [ ] Can listen in podcast app
