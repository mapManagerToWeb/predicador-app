import { Component, signal, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Profile } from '../../core/services/profile';
import { UserProfile } from '../../core/models/models';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class ProfilePage implements OnInit {
  private profileService = inject(Profile);
  private router = inject(Router);

  name = signal('');
  lastName = signal('');
  selectedAvatar = signal(0);

  avatars = [
    { id: 0, emoji: '👨', color: '#3b82f6' },
    { id: 1, emoji: '👩', color: '#8b5cf6' },
    { id: 2, emoji: '🧑', color: '#06b6d4' },
    { id: 3, emoji: '👴', color: '#f59e0b' },
    { id: 4, emoji: '👵', color: '#ef4444' },
    { id: 5, emoji: '🧔', color: '#10b981' },
    { id: 6, emoji: '👱', color: '#f97316' },
    { id: 7, emoji: '👲', color: '#6366f1' },
  ];

  ngOnInit(): void {
    if (this.profileService.hasProfile()) {
      this.router.navigate(['/map']);
    }
  }

  selectAvatar(id: number): void {
    this.selectedAvatar.set(id);
  }

  save(): void {
    if (!this.name() || !this.lastName()) return;
    this.profileService.save({
      name: this.name(),
      lastName: this.lastName(),
      avatar: this.selectedAvatar()
    });
    this.router.navigate(['/map']);
  }
}
