import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QrScanner } from './qr-scanner';

describe('QrScanner', () => {
  let component: QrScanner;
  let fixture: ComponentFixture<QrScanner>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QrScanner]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QrScanner);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
