export class OrderStatusChangedEvent {
  constructor(public readonly orderId: string) {}
}
