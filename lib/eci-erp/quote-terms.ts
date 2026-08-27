export type QuoteTermsSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  bulletsAfterParagraph?: number;
};

export const quoteTermsSections: QuoteTermsSection[] = [
  {
    heading: "1. Scope",
    paragraphs: [
      "1.1 These Terms and Conditions (hereinafter \"Terms\") govern all patent filing-related services provided by the service provider (hereinafter \"Service Provider\") to the client (hereinafter \"Client\"), including but not limited to:",
      "1.2 The Service Provider does not provide any legal advice, patentability opinions, or prosecution strategy services. The Client remains solely responsible for the substance, accuracy, and completeness of all documents submitted.",
      "1.3 If the parties have executed a separate master services agreement, and its terms conflict with these Terms, the master services agreement shall prevail.",
      "1.4 Where these Terms are appended to a quotation and used as a standalone instrument (i.e. the parties have not separately executed a master services agreement), these Terms together with the quotation shall constitute the entire agreement between the parties with respect to the services described in the quotation. In the event of any conflict between these Terms and the quotation, the quotation shall prevail.",
    ],
    bullets: [
      "Translation of patent filing documents;",
      "Filing of documents with patent offices in various countries or regions and subsequent procedural management;",
      "Other ancillary matters related to the foregoing services.",
    ],
    bulletsAfterParagraph: 1,
  },
  {
    heading: "2. Quotation and Acceptance",
    paragraphs: [
      "2.1 The Service Provider's quotation (including the fees, timelines, and scope of services set out therein) constitutes a specific statement of work under these Terms. The quotation is valid for thirty (30) days from the date stated therein.",
      "2.2 The Client's issuance of a work authorization, purchase order, acceptance of deliverables, or payment of any fees shall be deemed unconditional acceptance of these Terms. Any conflicting terms in the Client's purchase documents shall not be effective.",
      "2.3 If the scope of services changes (e.g., amendments, additions or deletions of text, additional countries, etc.), the Service Provider shall issue a change order and may adjust the fees accordingly.",
    ],
  },
  {
    heading: "3. Service Delivery and Timelines",
    paragraphs: [
      "3.1 The Service Provider shall use commercially reasonable efforts to complete the services within the agreed timeframe. Rush projects may affect the usual quality control standards, and the Service Provider may charge additional rush fees.",
      "3.2 For the Translation Services, the Service Provider shall deliver the translated documents in the format agreed in the quotation. The Client shall inspect and accept the deliverables within the acceptance period specified in the quotation. If no acceptance period is specified in the quotation, the default acceptance period shall be seven (7) working days from the date of delivery. If the Client does not raise any written material objection within such acceptance period, the deliverables shall be deemed accepted in full.",
      "For the Filing Services, the Service Provider shall complete the filing with the relevant patent office and provide the Client with the official filing receipt, acknowledgment number, or any equivalent official document issued by the patent office. Delivery of such official document shall be deemed final and conclusive completion of the Filing Services, and no separate acceptance procedure or additional review period shall apply.",
      "3.3 All final deliverables shall be delivered by email or other means.",
    ],
  },
  {
    heading: "4. Fees and Payment",
    paragraphs: [
      "4.1 The Client shall pay fees as set out in the quotation.",
      "4.2 All fees shall be paid within thirty (30) days of receipt of the Service Provider's invoice. Overdue amounts shall accrue interest at the rate of 0.003% per day (or the maximum lawful rate, if lower), calculated daily.",
      "4.3 The Client shall not make any set-off, counterclaim, or deduction of any undisputed fees. Any dispute concerning the quality of services shall be resolved in accordance with Clause 8 (Warranty and Limitation of Liability) and shall not excuse the Client from paying the undisputed portion of the fees when due.",
    ],
  },
  {
    heading: "5. Cancellation and Changes",
    paragraphs: [
      "If the Client cancels a project before completion, the Client shall pay the Service Provider for all work already performed, plus any third-party costs that the Service Provider has irrevocably incurred in connection with the cancelled work.",
    ],
  },
  {
    heading: "6. Confidentiality",
    paragraphs: [
      "Both parties shall keep confidential all business secrets, quotation details, patent filing content, and other information disclosed in connection with these Terms for a period of three (3) years after disclosure (or indefinitely in the case of trade secrets), except to the extent required by law or court order. The Service Provider shall, by written contract, require its sub-contractors to observe an equivalent standard of confidentiality. Where the services involve the cross-border transfer of personal information, the Service Provider shall take such measures as are reasonably necessary to comply with applicable data protection laws.",
    ],
  },
  {
    heading: "7. Warranty and Limitation of Liability",
    paragraphs: [
      "7.1 The Service Provider warrants that, for a period of thirty (30) days after final delivery, the services and deliverables shall materially conform to the specifications in the quotation. If any material non-conformity is reported in writing within such 30-day period, the Service Provider shall have thirty (30) days (or a longer period if reasonably necessary) to correct it. Such correction shall be the Client's sole remedy and the Service Provider's sole liability for any warranty failure.",
      "7.2 Except for the express warranty above, the Service Provider makes no other warranties, express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement.",
      "7.3 Limitation of Liability: Except in cases of gross negligence or wilful misconduct, neither party shall be liable to the other for any consequential, incidental, punitive, special, exemplary, or indirect damages (including loss of profits, data, or savings). In any event, the aggregate liability of each party to the other shall not exceed the total fees paid or payable for the specific service giving rise to the claim.",
    ],
  },
  {
    heading: "8. Governing Law and Arbitration",
    paragraphs: [
      "8.1 These Terms and any non-contractual obligations arising from them shall be governed by and construed in accordance with the laws of Singapore.",
      "8.2 Any dispute, controversy, or claim arising out of or relating to these Terms (including its existence, validity, interpretation, performance, breach, or termination) shall be finally settled by arbitration administered by the Singapore International Arbitration Centre (SIAC) in accordance with the SIAC Arbitration Rules in force at the time of the arbitration.",
      "8.3 The seat of arbitration shall be Singapore. The language of arbitration shall be English. The tribunal shall consist of one arbitrator. The arbitral award shall be final and binding on both parties, and may be enforced in any court of competent jurisdiction.",
    ],
  },
  {
    heading: "9. Entire Agreement and Amendments",
    paragraphs: [
      "9.1 These Terms, together with the written quotation, constitute the entire agreement between the parties with respect to the services, and supersede all prior oral or written agreements.",
      "9.2 Any amendment, waiver, or cancellation of these Terms shall be in writing and signed by both parties.",
    ],
  },
  {
    heading: "10. Severability",
    paragraphs: [
      "If any provision of these Terms is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.",
    ],
  },
  {
    heading: "11. Assignment",
    paragraphs: [
      "The Client may not assign any rights or obligations under these Terms without the prior written consent of the Service Provider. The Service Provider may delegate the performance of services to its affiliates and authorized sub-contractors.",
    ],
  },
];
