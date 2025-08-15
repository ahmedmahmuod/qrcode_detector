import {
  Component, ViewChild, ElementRef, AfterViewInit, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Result, DecodeHintType, BarcodeFormat } from '@zxing/library';

@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './qr-scanner.html',
  styleUrls: ['./qr-scanner.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QrScannerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;

  // حصر القراءة على QR فقط لتسريع الفك
  private readonly hints = new Map<DecodeHintType, any>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]
  ]);

  private reader = new BrowserMultiFormatReader(this.hints);
  private controls?: IScannerControls;
  private stream?: MediaStream;

  devices: MediaDeviceInfo[] = [];
  selectedDeviceId?: string;

  scanning = false;
  resultText = '';
  errorMsg: string | null = null;

  // torch
  hasTorch = false;
  torchOn = false;

  constructor(private cdr: ChangeDetectorRef) {}

  async ngAfterViewInit(): Promise<void> {
    await this.refreshDevices();
    document.addEventListener('visibilitychange', this.handleVisibility, { passive: true });
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.stopScan();
  }

  // تحديث قائمة الكاميرات (مع fallback قبل الإذن)
  private async refreshDevices(): Promise<void> {
    try {
      this.devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if ((!this.devices?.length) && navigator.mediaDevices?.enumerateDevices) {
        const all = await navigator.mediaDevices.enumerateDevices();
        this.devices = all.filter(d => d.kind === 'videoinput') as MediaDeviceInfo[];
      }
      const first = this.devices[0];
      this.selectedDeviceId = first?.deviceId || undefined;
      this.cdr.markForCheck();
    } catch (e) {
      this.setError('تعذّر الوصول لأجهزة الكاميرا.');
      // لا ترمِ الاستثناء؛ فقط سجّله
      console.error(e);
    }
  }

  // “تسخين” الإذن (اختياري: استدعِه من حدث مستخدم قبل البدء لتقليل التأخير)
  async warmUpPermission(): Promise<void> {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach(t => t.stop());
    } catch {
      /* تجاهل */
    } finally {
      // بعد منح الإذن تظهر أسماء الكاميرات
      setTimeout(() => this.refreshDevices(), 300);
    }
  }

  async startScan(): Promise<void> {
    this.scanning = true;
    this.errorMsg = null;
    this.resultText = '';
    this.torchOn = false;
    this.hasTorch = false;
    this.cdr.markForCheck();

    // قيود الفيديو: دقة منخفضة + كاميرا خلفية. لو deviceId مُحدد نستخدمه.
    const videoConstraints: MediaTrackConstraints =
      this.selectedDeviceId && this.selectedDeviceId.length
        ? { deviceId: { exact: this.selectedDeviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } };

    // استخدم decodeFromConstraints لسرعة وأفضل توافق
    this.reader.decodeFromConstraints(
      { audio: false, video: videoConstraints },
      this.videoRef.nativeElement,
      (result: Result | undefined, err: unknown, controls: IScannerControls) => {
        if (!this.controls) this.controls = controls;

        // احفظ الـ stream لاستخدام الفلاش والـ cleanup
        const v = this.videoRef.nativeElement;
        this.stream = (v.srcObject as MediaStream) || this.stream;

        // فحص دعم الفلاش مرة واحدة
        this.detectTorchSupport();

        if (result) {
          this.resultText = result.getText().trim();
          this.stopScan(); // يوقف الكنترولز والتراكات
          this.cdr.markForCheck();
        } else if (err) {
          // أخطاء القراءة المؤقتة تُتجاهل؛ أخطاء إذن/كاميرا تُعرض
          const msg = this.mapError(err);
          if (msg) { this.setError(msg); }
        }
      }
    ).catch(e => {
      this.setError(this.mapError(e) || 'فشل بدء المسح.');
      this.scanning = false;
      this.cdr.markForCheck();
    });

    // بعد منح الإذن حدّث الأجهزة لظهور الأسماء
    setTimeout(() => this.refreshDevices(), 800);
  }

  stopScan(): void {
    this.controls?.stop();
    this.controls = undefined;
    this.stopTracks();
    this.scanning = false;
    this.torchOn = false;
    this.cdr.markForCheck();
  }

  onDeviceChange(deviceId: string): void {
    this.selectedDeviceId = deviceId || undefined;
    if (this.scanning) {
      this.stopScan();
      // يمكنك إعادة البدء تلقائيًا إن رغبت:
      // void this.startScan();
    }
  }

  // ===== Utilities =====
  private stopTracks(): void {
    const s = (this.videoRef.nativeElement.srcObject as MediaStream) || this.stream;
    s?.getTracks().forEach(t => t.stop());
    this.videoRef.nativeElement.srcObject = null;
    this.stream = undefined;
  }

  private detectTorchSupport(): void {
    const track = this.stream?.getVideoTracks()[0];
    try {
      const caps = (track as any)?.getCapabilities?.();
      this.hasTorch = !!caps && 'torch' in caps && !!caps.torch;
    } catch {
      this.hasTorch = false;
    }
  }

  async toggleTorch(): Promise<void> {
    if (!this.hasTorch) return;
    const track = this.stream?.getVideoTracks()[0];
    try {
      this.torchOn = !this.torchOn;
      await (track as any)?.applyConstraints({ advanced: [{ torch: this.torchOn }] });
    } catch {
      this.torchOn = false;
      this.hasTorch = false;
    } finally {
      this.cdr.markForCheck();
    }
  }

  private mapError(err: unknown): string | null {
    // أعد رسائل واضحة للأذونات والأجهزة؛ تجاهل أخطاء فكّ الإطار المؤقتة.
    const name = (err as any)?.name || (err as any)?.constructor?.name;
    switch (name) {
      case 'NotAllowedError': return 'تم رفض إذن الكاميرا.';
      case 'NotFoundError': return 'لا توجد كاميرا متاحة.';
      case 'NotReadableError': return 'تعذّر فتح الكاميرا (قد تكون مستخدمة).';
      case 'OverconstrainedError': return 'قيود الكاميرا غير مدعومة على هذا الجهاز.';
      case 'SecurityError': return 'الدخول للكاميرا مرفوض لأسباب أمنية (تحقّق من HTTPS).';
      default: return null; // أخطاء القراءة المؤقتة لا نعرضها للمستخدم
    }
  }

  private setError(msg: string): void {
    this.errorMsg = msg;
    this.scanning = false;
    this.stopTracks();
    this.cdr.markForCheck();
  }

  private handleVisibility = (): void => {
    if (document.hidden && this.scanning) this.stopScan();
  };

  // مساعدات عرض
  isUrl(v: string): boolean {
    try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch { return false; }
  }
}
