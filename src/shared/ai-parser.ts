import type { Capture, ParsePayload } from './types';

/**
 * AI-Enhanced Parser using free LLM APIs
 * Supports: Google Gemini (free), Hugging Face, or local parsing fallback
 */

export interface AIParserConfig {
  enabled: boolean;
  provider: 'gemini' | 'huggingface' | 'local';
  apiKey?: string;
}

interface AIParseResult {
  title: string;
  kind: 'event' | 'task';
  start?: string;
  end?: string;
  due?: string;
  location?: string;
  attendees?: Array<{ name?: string; email: string }>;
  notes?: string;
  priority?: 'low' | 'medium' | 'high';
  confidence: number;
}

/**
 * Use Google Gemini API (free tier: 15 requests/min)
 * Model: gemini-2.0-flash
 * Get API key from: https://makersuite.google.com/app/apikey
 */
async function parseWithGemini(text: string, apiKey: string): Promise<AIParseResult> {
  const prompt = `You are a smart assistant that extracts calendar events and tasks from text.
Analyze this text and extract event/task details in JSON format:

Text: "${text}"

Return ONLY valid JSON with this structure:
{
  "kind": "event" or "task",
  "title": "short title",
  "start": "ISO datetime if event",
  "end": "ISO datetime if event",
  "due": "ISO datetime if task",
  "location": "location if mentioned",
  "attendees": [{"name": "optional", "email": "if found"}],
  "notes": "additional context",
  "priority": "low/medium/high",
  "confidence": 0.0-1.0
}`;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 500
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
    
    const result = JSON.parse(jsonText);
    return result;
  } catch (error) {
    console.error('Gemini parsing failed:', error);
    throw error;
  }
}

/**
 * Use Hugging Face Inference API (free tier available)
 * Get API key from: https://huggingface.co/settings/tokens
 */
async function parseWithHuggingFace(text: string, apiKey: string): Promise<AIParseResult> {
  const prompt = `Extract event or task details from: "${text}"
Return JSON: {"kind":"event/task","title":"...","start":"ISO date","confidence":0-1}`;

  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { max_new_tokens: 300, temperature: 0.2 }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.statusText}`);
    }

    const data = await response.json();
    const generatedText = data[0]?.generated_text || '{}';
    
    // Extract JSON from the response
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    
    return {
      kind: result.kind || 'task',
      title: result.title || text.slice(0, 100),
      start: result.start,
      end: result.end,
      due: result.due,
      location: result.location,
      confidence: result.confidence || 0.5
    };
  } catch (error) {
    console.error('HuggingFace parsing failed:', error);
    throw error;
  }
}

/**
 * Main AI parsing function
 */
export async function enhanceWithAI(
  payload: ParsePayload,
  config: AIParserConfig
): Promise<Partial<Capture> | null> {
  if (!config.enabled) {
    return null;
  }

  try {
    let result: AIParseResult;

    switch (config.provider) {
      case 'gemini':
        if (!config.apiKey) {
          throw new Error('Gemini API key required');
        }
        result = await parseWithGemini(payload.text, config.apiKey);
        break;

      case 'huggingface':
        if (!config.apiKey) {
          throw new Error('HuggingFace API key required');
        }
        result = await parseWithHuggingFace(payload.text, config.apiKey);
        break;

      default:
        return null;
    }

    // Convert AI result to Capture format
    const baseEnhanced = {
      kind: result.kind,
      title: result.title,
      location: result.location,
      attendees: result.attendees,
      notes: result.notes,
      confidence: result.confidence
    };

    if (result.kind === 'event') {
      return {
        ...baseEnhanced,
        kind: 'event' as const,
        start: result.start,
        end: result.end
      };
    } else {
      return {
        ...baseEnhanced,
        kind: 'task' as const,
        due: result.due,
        priority: result.priority
      };
    }
  } catch (error) {
    console.error('AI enhancement failed:', error);
    return null;
  }
}

/**
 * Get AI parser configuration from storage
 */
export async function getAIConfig(): Promise<AIParserConfig> {
  // This will be implemented to read from chrome.storage
  return {
    enabled: false,
    provider: 'gemini'
  };
}
