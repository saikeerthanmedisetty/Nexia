/**
 * Dynamic AI Thumbnail Synthesizer
 * Generates custom, high-resolution 16:9 thumbnails on the fly from visual prompts.
 */

export interface GeneratedThumbnail {
  url: string;
  base64?: string;
  prompt: string;
  dimensions: string;
  aspect_ratio: string;
}

export async function generateThumbnailFromPrompt(visualPrompt: string): Promise<GeneratedThumbnail> {
  const cleanPrompt = visualPrompt
    .replace(/^["']|["']$/g, '')
    .trim() || 'Cinematic high-contrast YouTube video thumbnail, 8k resolution, dramatic lighting';

  const seed = Math.floor(Math.random() * 1000000);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1280&height=720&nologo=true&seed=${seed}&model=flux`;

  let base64Data: string | undefined;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'image/jpeg,image/png,*/*',
      },
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > 1000) {
        base64Data = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      }
    }
  } catch (err: any) {
    console.warn(`[Thumbnail Synthesizer] Online fetch notice: ${err.message}. Using direct image URL.`);
  }

  return {
    url: imageUrl,
    base64: base64Data,
    prompt: cleanPrompt,
    dimensions: '1280x720',
    aspect_ratio: '16:9',
  };
}
