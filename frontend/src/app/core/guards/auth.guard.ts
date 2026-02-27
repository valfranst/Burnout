import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (_route, _state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn) {
    await auth.loadCurrentUser();
  }

  if (auth.isLoggedIn) return true;
  return router.createUrlTree(['/login']);
};
