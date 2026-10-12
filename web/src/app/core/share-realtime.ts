import { Injectable, OnDestroy } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { ShareStatusChanged } from './share.models';

/** Live status updates for a ceremony's shares (spec §3.5 — no page refresh needed). */
export abstract class ShareRealtime {
  abstract readonly statusChanged$: Observable<ShareStatusChanged>;
  abstract connect(ceremonyId: string): Promise<void>;
  abstract disconnect(): Promise<void>;
}

@Injectable()
export class SignalRShareRealtime extends ShareRealtime implements OnDestroy {
  private readonly changes = new Subject<ShareStatusChanged>();
  readonly statusChanged$ = this.changes.asObservable();

  private hub?: HubConnection;
  private ceremonyId?: string;

  async connect(ceremonyId: string): Promise<void> {
    this.ceremonyId = ceremonyId;
    if (!this.hub) {
      this.hub = new HubConnectionBuilder()
        .withUrl(`${environment.apiBaseUrl}${environment.shareHubPath}`)
        .withAutomaticReconnect()
        .configureLogging(environment.production ? LogLevel.Warning : LogLevel.Information)
        .build();
      this.hub.on('shareStatusChanged', (e: ShareStatusChanged) => this.changes.next(e));
      // Group membership is lost on reconnect, so rejoin.
      this.hub.onreconnected(() => this.joinCeremony());
    }
    if (this.hub.state === HubConnectionState.Disconnected) {
      await this.hub.start();
    }
    await this.joinCeremony();
  }

  async disconnect(): Promise<void> {
    await this.hub?.stop();
  }

  ngOnDestroy(): void {
    void this.disconnect();
    this.changes.complete();
  }

  /** Server adds this connection to the ceremony+company group it pushes `shareStatusChanged` to. */
  private joinCeremony(): Promise<void> {
    return this.hub!.invoke('JoinCeremony', this.ceremonyId);
  }
}
