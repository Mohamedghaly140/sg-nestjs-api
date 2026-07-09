import type { OrderTemplateItem } from './order-mail-template.types';

export const MAIL_BRAND = {
  name: 'SG Couture',
  accentColor: '#9f6b4f',
  backgroundColor: '#f4f1ee',
  cardBackground: '#ffffff',
  textColor: '#1f2328',
  mutedTextColor: '#6b7280',
} as const;

export type MailContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'itemsTable'; items: OrderTemplateItem[] }
  | {
      type: 'totals';
      itemsSubtotal: string;
      discountApplied: string;
      shippingFees: string;
      totalOrderPrice: string;
    }
  | { type: 'button'; label: string; url: string };

export interface RenderMailLayoutInput {
  previewText: string;
  heading: string;
  blocks: MailContentBlock[];
}

export interface RenderedMailLayout {
  html: string;
  text: string;
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const PREHEADER_PADDING =
  '&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;';

export function renderMailLayout(
  input: RenderMailLayoutInput,
): RenderedMailLayout {
  return {
    html: renderHtml(input),
    text: renderText(input),
  };
}

function renderHtml(input: RenderMailLayoutInput): string {
  const blockHtml = input.blocks.map(renderBlockHtml).join('');

  return `<!doctype html>
<html lang="en" style="background-color:${MAIL_BRAND.backgroundColor};">
  <head style="background-color:${MAIL_BRAND.backgroundColor};">
    <meta charset="utf-8" style="font-family:${FONT_STACK};">
    <meta name="viewport" content="width=device-width, initial-scale=1" style="font-family:${FONT_STACK};">
    <style>
      @media only screen and (max-width: 620px) {
        .mail-shell { padding: 16px !important; }
        .mail-card { width: 100% !important; }
        .mail-content { padding: 24px !important; }
      }
    </style>
  </head>
  <body style="background-color:${MAIL_BRAND.backgroundColor};font-family:${FONT_STACK};padding:0;width:100%;">
    <span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${MAIL_BRAND.backgroundColor};">${escapeHtml(
      input.previewText,
    )}${PREHEADER_PADDING}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL_BRAND.backgroundColor}" style="background-color:${MAIL_BRAND.backgroundColor};border-collapse:collapse;width:100%;">
      <tr style="font-family:${FONT_STACK};">
        <td align="center" class="mail-shell" style="font-family:${FONT_STACK};padding:32px 20px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL_BRAND.cardBackground}" class="mail-card" style="background-color:${MAIL_BRAND.cardBackground};border-collapse:collapse;border-radius:8px;max-width:600px;overflow:hidden;width:600px;">
            <tr style="font-family:${FONT_STACK};">
              <td bgcolor="${MAIL_BRAND.textColor}" style="background-color:${MAIL_BRAND.textColor};font-family:${FONT_STACK};padding:24px 32px;">
                <p style="color:${MAIL_BRAND.cardBackground};font-family:${FONT_STACK};font-size:20px;font-weight:700;line-height:28px;margin:0;">${escapeHtml(
                  MAIL_BRAND.name,
                )}</p>
              </td>
            </tr>
            <tr style="font-family:${FONT_STACK};">
              <td bgcolor="${MAIL_BRAND.cardBackground}" class="mail-content" style="background-color:${MAIL_BRAND.cardBackground};font-family:${FONT_STACK};padding:32px;">
                <h1 style="color:${MAIL_BRAND.textColor};font-family:${FONT_STACK};font-size:24px;font-weight:700;line-height:32px;margin:0;padding:0 0 24px;">${escapeHtml(
                  input.heading,
                )}</h1>
                ${blockHtml}
              </td>
            </tr>
            <tr style="font-family:${FONT_STACK};">
              <td bgcolor="${MAIL_BRAND.cardBackground}" style="background-color:${MAIL_BRAND.cardBackground};border-top:1px solid #e5e7eb;font-family:${FONT_STACK};padding:20px 32px;">
                <p style="color:${MAIL_BRAND.mutedTextColor};font-family:${FONT_STACK};font-size:12px;line-height:18px;margin:0;">This automated message was sent by ${escapeHtml(
                  MAIL_BRAND.name,
                )}. Please do not reply to this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText(input: RenderMailLayoutInput): string {
  return [
    input.heading,
    ...input.blocks.map(renderBlockText).filter((block) => block.length > 0),
  ].join('\n\n');
}

function renderBlockHtml(block: MailContentBlock): string {
  switch (block.type) {
    case 'paragraph':
      return renderParagraphHtml(block.text);
    case 'itemsTable':
      return renderItemsTableHtml(block.items);
    case 'totals':
      return renderTotalsHtml(block);
    case 'button':
      return renderButtonHtml(block);
  }
}

function renderBlockText(block: MailContentBlock): string {
  switch (block.type) {
    case 'paragraph':
      return block.text;
    case 'itemsTable':
      return block.items
        .map(
          (item) => `- ${item.name} x ${item.quantity}: EGP ${item.lineTotal}`,
        )
        .join('\n');
    case 'totals':
      return [
        `Subtotal: EGP ${block.itemsSubtotal}`,
        `Discount: EGP ${block.discountApplied}`,
        `Shipping: EGP ${block.shippingFees}`,
        `Total: EGP ${block.totalOrderPrice}`,
      ].join('\n');
    case 'button':
      return `${block.label}: ${block.url}`;
  }
}

function renderParagraphHtml(text: string): string {
  return `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL_BRAND.cardBackground}" style="background-color:${MAIL_BRAND.cardBackground};border-collapse:collapse;width:100%;">
                  <tr style="font-family:${FONT_STACK};">
                    <td style="font-family:${FONT_STACK};padding:0 0 18px;">
                      <p style="color:${MAIL_BRAND.textColor};font-family:${FONT_STACK};font-size:15px;line-height:24px;margin:0;">${escapeHtml(
                        text,
                      )}</p>
                    </td>
                  </tr>
                </table>`;
}

function renderItemsTableHtml(items: OrderTemplateItem[]): string {
  const rows = items
    .map(
      (item) => `
                      <tr style="font-family:${FONT_STACK};">
                        <td style="border-top:1px solid #e5e7eb;color:${MAIL_BRAND.textColor};font-family:${FONT_STACK};font-size:14px;line-height:20px;padding:12px 8px 12px 0;">${escapeHtml(
                          item.name,
                        )}</td>
                        <td align="center" style="border-top:1px solid #e5e7eb;color:${MAIL_BRAND.textColor};font-family:${FONT_STACK};font-size:14px;line-height:20px;padding:12px 8px;">${item.quantity}</td>
                        <td align="right" style="border-top:1px solid #e5e7eb;color:${MAIL_BRAND.textColor};font-family:${FONT_STACK};font-size:14px;line-height:20px;padding:12px 8px;">EGP ${escapeHtml(
                          item.price,
                        )}</td>
                        <td align="right" style="border-top:1px solid #e5e7eb;color:${MAIL_BRAND.textColor};font-family:${FONT_STACK};font-size:14px;line-height:20px;padding:12px 0 12px 8px;">EGP ${escapeHtml(
                          item.lineTotal,
                        )}</td>
                      </tr>`,
    )
    .join('');

  return `
                <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL_BRAND.cardBackground}" style="background-color:${MAIL_BRAND.cardBackground};border-collapse:collapse;width:100%;">
                  <thead style="font-family:${FONT_STACK};">
                    <tr style="font-family:${FONT_STACK};">
                      <th align="left" scope="col" style="color:${MAIL_BRAND.mutedTextColor};font-family:${FONT_STACK};font-size:12px;font-weight:700;letter-spacing:0;text-transform:uppercase;line-height:18px;padding:0 8px 10px 0;">Item</th>
                      <th align="center" scope="col" style="color:${MAIL_BRAND.mutedTextColor};font-family:${FONT_STACK};font-size:12px;font-weight:700;letter-spacing:0;text-transform:uppercase;line-height:18px;padding:0 8px 10px;">Qty</th>
                      <th align="right" scope="col" style="color:${MAIL_BRAND.mutedTextColor};font-family:${FONT_STACK};font-size:12px;font-weight:700;letter-spacing:0;text-transform:uppercase;line-height:18px;padding:0 8px 10px;">Price</th>
                      <th align="right" scope="col" style="color:${MAIL_BRAND.mutedTextColor};font-family:${FONT_STACK};font-size:12px;font-weight:700;letter-spacing:0;text-transform:uppercase;line-height:18px;padding:0 0 10px 8px;">Total</th>
                    </tr>
                  </thead>
                  <tbody style="font-family:${FONT_STACK};">${rows}
                  </tbody>
                </table>`;
}

function renderTotalsHtml(
  block: Extract<MailContentBlock, { type: 'totals' }>,
): string {
  const rows: Array<[string, string, boolean]> = [
    ['Subtotal', block.itemsSubtotal, false],
    ['Discount', block.discountApplied, false],
    ['Shipping', block.shippingFees, false],
    ['Total', block.totalOrderPrice, true],
  ];

  const renderedRows = rows
    .map(([label, amount, isTotal]) => {
      const fontWeight = isTotal ? '700' : '400';
      const fontSize = isTotal ? '16px' : '14px';

      return `
                      <tr style="font-family:${FONT_STACK};">
                        <td style="color:${MAIL_BRAND.textColor};font-family:${FONT_STACK};font-size:${fontSize};font-weight:${fontWeight};line-height:22px;padding:6px 12px 6px 0;">${label}</td>
                        <td align="right" style="color:${MAIL_BRAND.textColor};font-family:${FONT_STACK};font-size:${fontSize};font-weight:${fontWeight};line-height:22px;padding:6px 0 6px 12px;">EGP ${escapeHtml(
                          amount,
                        )}</td>
                      </tr>`;
    })
    .join('');

  return `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL_BRAND.cardBackground}" style="background-color:${MAIL_BRAND.cardBackground};border-collapse:collapse;width:100%;">
                  <tr style="font-family:${FONT_STACK};">
                    <td align="right" style="font-family:${FONT_STACK};padding:20px 0 4px;">
                      <table role="presentation" width="260" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL_BRAND.cardBackground}" style="background-color:${MAIL_BRAND.cardBackground};border-collapse:collapse;width:260px;">${renderedRows}
                      </table>
                    </td>
                  </tr>
                </table>`;
}

function renderButtonHtml(
  block: Extract<MailContentBlock, { type: 'button' }>,
): string {
  return `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MAIL_BRAND.cardBackground}" style="background-color:${MAIL_BRAND.cardBackground};border-collapse:collapse;width:100%;">
                  <tr style="font-family:${FONT_STACK};">
                    <td align="left" style="font-family:${FONT_STACK};padding:8px 0 18px;">
                      <a href="${escapeHtml(block.url)}" style="background-color:${MAIL_BRAND.accentColor};border-radius:6px;color:${MAIL_BRAND.cardBackground};display:inline-block;font-family:${FONT_STACK};font-size:15px;font-weight:700;line-height:20px;padding:12px 18px;text-decoration:none;">${escapeHtml(
                        block.label,
                      )}</a>
                    </td>
                  </tr>
                </table>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
