export { ButtonComponent, type ButtonKind } from './button/button.component';
export { PanelComponent } from './panel/panel.component';
export { ToggleComponent } from './toggle/toggle.component';
export { CheckboxComponent } from './checkbox/checkbox.component';
export { ChipComponent } from './chip/chip.component';
export { TabsComponent, type TabDef } from './tabs/tabs.component';
export { MethodBadgeComponent } from './method-badge/method-badge.component';
export { StatusChipComponent, type Tone } from './status-chip/status-chip.component';
export { MetricComponent } from './metric/metric.component';
export { EmptyStateComponent } from './empty-state/empty-state.component';
export { CodeBlockComponent } from './code-block/code-block.component';
export { BrandMarkComponent, type BrandMarkVariant } from './brand-mark/brand-mark.component';
export { SetupChecklistComponent } from './setup-checklist/setup-checklist.component';
export { PageActionsDirective } from './page-actions.directive';

/**
 * Convenience bundle for pages that use most of the kit. Standalone components
 * can spread this into their `imports`.
 */
import { ButtonComponent } from './button/button.component';
import { PanelComponent } from './panel/panel.component';
import { ToggleComponent } from './toggle/toggle.component';
import { CheckboxComponent } from './checkbox/checkbox.component';
import { ChipComponent } from './chip/chip.component';
import { TabsComponent } from './tabs/tabs.component';
import { MethodBadgeComponent } from './method-badge/method-badge.component';
import { StatusChipComponent } from './status-chip/status-chip.component';
import { MetricComponent } from './metric/metric.component';
import { EmptyStateComponent } from './empty-state/empty-state.component';
import { CodeBlockComponent } from './code-block/code-block.component';
import { PageActionsDirective } from './page-actions.directive';

export const UI = [
  ButtonComponent,
  PanelComponent,
  ToggleComponent,
  CheckboxComponent,
  ChipComponent,
  TabsComponent,
  MethodBadgeComponent,
  StatusChipComponent,
  MetricComponent,
  EmptyStateComponent,
  CodeBlockComponent,
  PageActionsDirective,
] as const;
