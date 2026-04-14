import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key') {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
    }

    const formData = await req.formData();
    const audioBlob = formData.get('audio') as Blob | null;

    if (!audioBlob) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const file = new File([audioBlob], 'recording.webm', { type: audioBlob.type || 'audio/webm' });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en',
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err) {
    console.error('[/api/transcribe]', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
