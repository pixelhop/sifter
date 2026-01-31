# AI Podcast Highlights - MVP Specification

## Overview
Personalized podcast digest generator that listens to podcasts on your behalf, extracts relevant clips using AI, and stitches them into a polished daily/weekly digest with an AI narrator.

**Key Differentiator:** Auto-stitched audio with high-quality AI narration and social sharing capabilities.

---

## User Journey

### Onboarding
1. User signs up with email
2. Selects topics/interests (tech, business, health, etc.)
3. Adds RSS feeds of podcasts they follow
4. Sets frequency: daily morning briefing, weekly digest
5. Sets length preference: 10, 20, or 30 minutes
6. Chooses AI narrator voice preference

### Daily/Weekly Experience
1. **Discovery**: System checks subscribed podcasts for new episodes
2. **Ingestion**: Downloads new episodes, transcribes with Whisper
3. **Analysis**: AI reads transcripts, identifies segments matching user interests
4. **Curation**: Selects best clips, sequences them logically
5. **Production**: AI narrator records intro/outro, transitions between clips
6. **Delivery**: User gets notification → opens private podcast feed → listens

### The Experience
```
[AI Narrator - warm, casual]
"Good morning Zef. First up, Lenny Rachitsky on the biggest mistakes 
founders make when searching for product-market fit..."

[Smooth fade transition - 0.5s]

[Podcast clip fades in]
Lenny: "The biggest mistake founders make is..."
[Clip continues for 90 seconds]

[Fade out]

[AI Narrator]
"Next, Dwarkesh Patel argues AI agents will replace software engineers 
by 2027. Here's his case..."

[Fade, clip plays]
```

---

## Podcast Directory APIs

For podcast discovery and RSS feed lookup, use these APIs:

### Option 1: iTunes Search API (Recommended for MVP)
- **Cost**: FREE (no API key needed)
- **Best for**: Quick search, zero setup
- **Example**:
```bash
curl "https://itunes.apple.com/search?term=startup&media=podcast&limit=10"
```
- **Returns**: Podcast name, artwork, author, and `feedUrl` (RSS feed)

### Option 2: Listen Notes API
- **Database**: 3.7M+ podcasts, 191M+ episodes
- **Cost**: Free (300 req/month) → Pro ($200/month for 5K)
- **Best for**: Comprehensive directory, full-text search
- **Website**: https://www.listennotes.com/api/
- **Note**: Requires "Powered by Listen Notes" logo, cannot cache data

### Option 3: Podcast Index
- **Cost**: 100% FREE forever
- **Best for**: Production, caching allowed
- **Limitations**: No episode-level search, trickier auth
- **Website**: https://podcastindex.org/

### Option 4: Taddy API
- **Cost**: Free (500 req/month) → Pro ($75/month for 100K)
- **Features**: Webhooks for new episodes, transcripts included
- **Best for**: Production apps needing real-time updates
- **Website**: https://taddy.org/developers/podcast-api

### Recommendation
- **MVP**: Use iTunes Search API — no auth, instant RSS feeds
- **Production**: Switch to Podcast Index (free) or Taddy (webhooks)

---

## System Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │────▶│  Podcast    │────▶│   RSS       │
│  Onboarding │     │  Selection  │     │  Monitor    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                         ┌──────────────────────┘
                         ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Private    │◀────│  Audio      │◀────│  Download   │
│  Podcast    │     │  Stitcher   │     │  + Whisper  │
│  Feed       │     │  (FFmpeg)   │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │  AI     │       │  Clip   │       │  AI     │
   │ Narrator│◀──────│ Selector│◀──────│ Analysis│
   │(TTS)    │       │ (GPT-4) │       │ (GPT-4) │
   └─────────┘       └─────────┘       └─────────┘
```

---

## Data Models

### User
```typescript
{
  id: string;
  email: string;
  preferences: {
    frequency: 'daily' | 'weekly';
    duration: 10 | 20 | 30; // minutes
    narratorVoice: string;
  };
  interests: string[]; // Topics/themes
  podcastSubscriptions: string[]; // RSS feed IDs
  publicFeedEnabled: boolean; // For sharing
}
```

### Podcast
```typescript
{
  id: string;
  rssUrl: string;
  title: string;
  author: string;
  lastCheckedAt: Date;
  episodes: Episode[];
}
```

### Episode
```typescript
{
  id: string;
  podcastId: string;
  title: string;
  audioUrl: string;
  publishedAt: Date;
  transcript: WhisperSegment[]; // With timestamps
  status: 'pending' | 'transcribed' | 'analyzed' | 'processed';
}
```

### Clip
```typescript
{
  id: string;
  episodeId: string;
  startTime: number; // seconds
  endTime: number;
  duration: number;
  transcript: string;
  relevanceScore: number; // 0-100
  reasoning: string; // Why this clip was selected
}
```

### Digest
```typescript
{
  id: string;
  userId: string;
  createdAt: Date;
  status: 'generating' | 'ready';
  clips: Clip[];
  narratorScript: string;
  audioUrl: string;
  duration: number;
  isPublic: boolean; // For sharing
  shareUrl?: string;
}
```

---

## Audio Pipeline

### 1. Download Episode
```bash
curl -o episode.mp3 <audioUrl>
```

### 2. Transcribe (Whisper API)
```bash
# Whisper outputs word-level timestamps
curl https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_KEY" \
  -F file=@episode.mp3 \
  -F model=whisper-1 \
  -F response_format=verbose_json
```

**Output includes:**
- `text`: Full transcript
- `words[]`: Array with `word`, `start`, `end` timestamps
- `segments[]`: Larger chunks with timestamps

### 3. AI Clip Selection (GPT-4)
```javascript
const prompt = `
You are a podcast editor. Analyze this transcript and extract the most 
interesting/valuable segments.

User interests: ${user.interests.join(', ')}
Episode: ${title} by ${author}

Transcript with timestamps:
${transcript}

Select 3-5 clips (30-120 seconds each) that:
1. Match user interests
2. Are self-contained (make sense without full context)
3. Have high information density
4. Include surprising insights or actionable advice

Return JSON:
{
  "clips": [
    {
      "start": "MM:SS",
      "end": "MM:SS",
      "summary": "Brief description",
      "relevance": 95,
      "reasoning": "Why this clip matters"
    }
  ]
}
`;
```

### 4. Slice Clips with FFmpeg
```bash
# Slice clip from timestamp
ffmpeg -i episode.mp3 -ss 00:02:15 -to 00:03:45 \
  -c copy clip_1.mp3

# Add fade in/out (0.5 second fades)
ffmpeg -i clip_1.mp3 \
  -af "afade=t=in:ss=0:d=0.5,afade=t=out:st=85:d=0.5" \
  clip_1_faded.mp3
```

### 5. Generate AI Narrator (ElevenLabs)
```javascript
// Generate narrator intro/outro
const narratorScript = generateNarratorScript(clips);

const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/VOICE_ID', {
  method: 'POST',
  headers: { 'xi-api-key': ELEVENLABS_KEY },
  body: JSON.stringify({
    text: narratorScript,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75
    }
  })
});
```

**Voice Options:**
- "Adam" - Professional but warm
- "Bella" - Friendly, conversational
- "Antoni" - Young, energetic
- Custom voice clone (future)

### 6. Mix Everything
```bash
# Create concat file
file 'narrator_intro.mp3'
file 'clip_1_faded.mp3'
file 'transition.mp3'  # Short musical sting
file 'narrator_bridge.mp3'
file 'clip_2_faded.mp3'
...

# Concatenate all files
ffmpeg -f concat -safe 0 -i files.txt \
  -c copy temp_output.mp3

# Add subtle background music (optional)
ffmpeg -i temp_output.mp3 -i ambient_music.mp3 \
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights='1 0.15'" \
  -c:a libmp3lame -q:a 2 final_digest.mp3
```

---

## AI Prompts

### Clip Selection
```
Analyze this podcast transcript and identify the most relevant segments.

User interests: {{interests}}
Episode: {{title}} by {{author}}

Transcript with timestamps:
{{transcript}}

Select 3-5 clips (30-120 seconds each) that would interest this user.
Prioritize: actionable advice, surprising insights, strong opinions.

Return JSON with start/end timestamps, summary, and relevance score.
```

### Narrator Script Generation
```
Write a casual radio host script introducing these podcast clips.

Clips:
{{clips}}

Style: Warm, conversational, like a smart friend recommending podcasts
- Use casual language ("You've gotta hear this...", "This part blew my mind")
- Include brief context for each clip
- Keep transitions smooth and natural
- Total script length: 15-20 seconds per clip intro

Output plain text ready for text-to-speech.
```

---

## Social Sharing / Viral Hook

### Public Curator Feeds
- Users can make their digest **public**
- Get a public RSS feed URL: `podcast.ai/u/username/feed`
- Others can subscribe to their curated feed
- Influencers become "editors" — people trust their taste

### Clip Sharing
- Share individual clips on social media
- Generated social cards with:
  - Clip transcript snippet
  - Audio player
  - "Listen to full digest" CTA
  - Attribution to original podcast

### Discovery Features
- Browse public digests by topic
- "Most shared clips this week"
- "Follow curators" feature

---

## API Endpoints

```
POST /auth/register
POST /auth/login

GET  /podcasts/search?q=query          # Search podcast index
POST /podcasts/subscribe               # Add RSS feed
GET  /podcasts/subscriptions           # List my podcasts

GET  /digests                          # List my digests
GET  /digests/:id/audio                # Stream MP3
POST /digests/:id/regenerate           # Re-generate
PATCH /digests/:id/public              # Make public/private

GET  /u/:username/feed                 # Public RSS feed
GET  /clips/:id                        # Get clip details
POST /clips/:id/share                  # Generate share link

POST /feedback                         # Rate clip relevance
```

---

## Background Jobs

### Job 1: RSS Monitor (Every hour)
```javascript
// Check all subscribed podcasts for new episodes
for (const user of activeUsers) {
  for (const podcast of user.subscriptions) {
    const newEpisodes = await checkRSS(podcast.rssUrl, podcast.lastCheckedAt);
    for (const episode of newEpisodes) {
      await createEpisode(episode);
      await queueJob('transcribe', episode.id);
    }
  }
}
```

### Job 2: Transcriber
```javascript
// Download audio → Whisper → Save transcript
downloadAudio(episode.audioUrl);
const transcript = await whisperTranscribe(episode.localPath);
await saveTranscript(episode.id, transcript);
await queueJob('analyze', episode.id);
```

### Job 3: Analyzer (AI Clip Selection)
```javascript
// GPT-4 analysis → Create clips
const clips = await selectClipsWithAI(episode.transcript, user.interests);
for (const clip of clips) {
  await createClip(episode.id, clip);
}
// Check if ready to generate digest
await tryGenerateDigest(user.id);
```

### Job 4: Stitcher
```javascript
// Generate narrator audio → Slice clips → Mix
generateNarratorAudio(digest.narratorScript);
sliceClips(digest.clips);
mixWithFFmpeg(digest.clips, narratorAudio);
uploadToS3(digest.id);
notifyUser(digest.userId);
```

---

## Tech Stack

**Backend:**
- Node.js with Express
- PostgreSQL for data
- Redis for job queue
- Bull for background jobs

**Audio Processing:**
- FFmpeg (slicing, mixing, transitions)
- OpenAI Whisper API ($0.006/minute)
- ElevenLabs API ($5/month for 100K chars ≈ 2hrs audio)

**Storage:**
- S3 for audio files
- CloudFront CDN for delivery

**Hosting:**
- Render/Railway for API
- Private podcast feed (RSS with token auth)

---

## Cost Estimation

**Per user per month (daily digest):**
- Whisper transcription: ~$1.80 (assuming 5 hrs of podcasts)
- ElevenLabs narrator: ~$0.50 per digest
- S3 storage: ~$0.10
- **Total: ~$2-3 per active user/month**

At $10/month subscription: ~70% gross margin

---

## MVP Scope

### In Scope
- [ ] User auth & profile setup
- [ ] RSS feed subscription (5-10 podcasts)
- [ ] Daily/weekly digest generation
- [ ] AI clip selection with GPT-4
- [ ] AI narrator with ElevenLabs
- [ ] Audio stitching with FFmpeg
- [ ] Private podcast feed
- [ ] Web app for management
- [ ] Public digest sharing

### Out of Scope (Future)
- [ ] Mobile app
- [ ] Two AI hosts conversing
- [ ] Custom voice cloning
- [ ] Real-time/live podcasts
- [ ] Video generation
- [ ] Advanced music mixing

---

## Success Metrics

- **Retention**: Users listening to 80%+ of digest
- **Engagement**: 3+ digests consumed per week
- **Viral**: 20%+ of users enable public sharing
- **Quality**: <5% "this clip wasn't relevant" feedback

---

## Open Questions

1. **Clip selection quality** — How to train/improve over time?
2. **Copyright** — Any issues with redistributing clips?
3. **Fair use** — Does transformative curation qualify?
4. **Voice preference** — One default or multiple options?
5. **Background music** — Licensed or generated?
