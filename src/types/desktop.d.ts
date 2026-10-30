export {};

declare global {
  type DesktopCaptureSource = { id: string; name: string; thumbnail: string };
  interface Window {
    darklordDesktop?: {
      appName: string;
      platform: string;
      listCaptureSources(): Promise<DesktopCaptureSource[]>;
      captureSource(id: string): Promise<{ dataUrl: string; capturedAt: string }>;
      recognizeImage(dataUrl: string): Promise<{ text: string; language: string }>;
    };
  }
}
