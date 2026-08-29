import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { RouterLink } from '@angular/router';

interface SetupStep {
  title: string;
  detail: string;
  /** Only the first incomplete step offers an action, so there is one way forward. */
  action?: string;
}

const STEPS: SetupStep[] = [
  {
    title: 'Add a server profile',
    detail: 'Base URL plus bearer token, basic auth, or an API key header.',
    action: 'Add server',
  },
  {
    title: 'Test the connection',
    detail: 'Confirms the endpoint answers and returns SCIM-shaped JSON.',
  },
  {
    title: 'Discover schemas',
    detail: 'Reads /Schemas so extension attributes autocomplete everywhere.',
  },
  {
    title: 'Define field mapping rules',
    detail: 'Optional. Enforces required attributes and formats during validation.',
  },
];

/**
 * First-run state for the screens that need a saved server.
 *
 * The design replaces an empty, unusable form with the ordered path to a
 * working setup — the blocked screen says what it needs and hands over the one
 * next action.
 */
@Component({
  selector: 'app-setup-checklist',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './setup-checklist.component.html',
  styleUrl: './setup-checklist.component.scss',
})
export class SetupChecklistComponent {
  readonly blurb = input('');
  protected readonly steps = STEPS;
}
