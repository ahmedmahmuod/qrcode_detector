import { Component, signal } from '@angular/core';
import { QrScannerComponent } from "./qr-scanner/qr-scanner";

@Component({
  selector: 'app-root',
  imports: [QrScannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('qr-code-detector');
}
