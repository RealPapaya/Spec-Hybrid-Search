// Mock spec corpus data
window.SPEC_DATA = {
  results: [
    {
      id: "r1",
      score: 0.9847,
      bm25: 0.91,
      semantic: 0.96,
      spec: "Intel® ME 16.5 Firmware Bringup Guide",
      specShort: "ME-FBG-16.5",
      vendor: "Intel",
      type: "ME",
      category: "BIOS",
      version: "Rev 2.4",
      date: "2025-08-12",
      page: 142,
      section: "4.3.7 — HECI Driver Initialization Sequence",
      excerpt: "The BIOS shall poll the H_RDY bit in the HECI_HOST_CSR register at offset 0x04h until it is asserted by the ME firmware, with a maximum timeout of 5000 milliseconds. If the timeout elapses, the platform must log POST code 0xE7 and halt the boot sequence pending operator intervention.",
      highlight: ["HECI", "ME firmware", "H_RDY"],
      context: {
        before: "4.3.6 — Pre-Boot Communication Channel\n\nPrior to OS handoff, the platform firmware establishes a dedicated communication channel with the Management Engine via the HECI (Host Embedded Controller Interface) bus. This channel is used to negotiate firmware capabilities, retrieve provisioning state, and synchronize platform configuration data. The host driver shall be initialized only after the ME has completed its internal POST routine and signaled readiness through the BIOS_BOOT_BARRIER mechanism.",
        match: "4.3.7 — HECI Driver Initialization Sequence\n\nThe BIOS shall poll the H_RDY bit in the HECI_HOST_CSR register at offset 0x04h until it is asserted by the ME firmware, with a maximum timeout of 5000 milliseconds. If the timeout elapses, the platform must log POST code 0xE7 and halt the boot sequence pending operator intervention.",
        after: "Once H_RDY is asserted, the BIOS issues a HECI_RESET sequence by writing 1b to the H_RST bit, waiting for acknowledgement from the ME, and then deasserting the bit. After acknowledgement, the BIOS may begin issuing MKHI (Management Engine Kernel Host Interface) commands.\n\n4.3.8 — MKHI Command Set Negotiation"
      }
    },
    {
      id: "r2",
      score: 0.9612,
      bm25: 0.88,
      semantic: 0.94,
      spec: "TCG PC Client Platform Firmware Profile",
      specShort: "TCG-PCCPFP",
      vendor: "TCG",
      type: "TPM",
      category: "BIOS",
      version: "v1.06 r52",
      date: "2024-12-03",
      page: 89,
      section: "9.4.1 — PCR[0] Measurement Boundaries",
      excerpt: "All firmware code executed prior to the EV_SEPARATOR event shall be measured into PCR[0] using SHA-256 (and optionally SHA-1 for legacy compatibility). The CRTM (Core Root of Trust for Measurement) is itself implicitly trusted and is not measured into any PCR.",
      highlight: ["PCR[0]", "SHA-256", "CRTM", "firmware"],
      context: {
        before: "9.4 — Platform Configuration Register Usage\n\nThe TPM 2.0 specification defines 24 platform configuration registers (PCRs) in the SHA-256 bank. The PC Client profile constrains the use of PCR[0] through PCR[7] for firmware-related measurements, with each register dedicated to a specific class of measurement.",
        match: "9.4.1 — PCR[0] Measurement Boundaries\n\nAll firmware code executed prior to the EV_SEPARATOR event shall be measured into PCR[0] using SHA-256 (and optionally SHA-1 for legacy compatibility). The CRTM (Core Root of Trust for Measurement) is itself implicitly trusted and is not measured into any PCR.",
        after: "Implementations MUST extend PCR[0] with the digest of the firmware volume containing the SEC and PEI phase code. The measurement order shall be deterministic across reboots; non-deterministic measurements shall be excluded or normalized prior to extension."
      }
    },
    {
      id: "r3",
      score: 0.9423,
      bm25: 0.79,
      semantic: 0.95,
      spec: "AMD Platform Security Processor BIOS Architecture",
      specShort: "AMD-PSP-BAG",
      vendor: "AMD",
      type: "ME",
      category: "BIOS",
      version: "1.7.3",
      date: "2025-03-18",
      page: 56,
      section: "5.2.4 — PSP Mailbox Protocol",
      excerpt: "Communication between the host x86 cores and the PSP is performed via a memory-mapped mailbox located at PSP_MAILBOX_BASE (typically 0xFEA0_0000). The host writes a command into the mailbox and signals the PSP by setting the COMMAND_VALID bit; the PSP responds by populating the response field and setting RESPONSE_VALID.",
      highlight: ["PSP", "mailbox", "host"],
      context: {
        before: "5.2 — Host-to-PSP Communication\n\nThe AMD Platform Security Processor (PSP) is an embedded ARM Cortex-A5 coprocessor responsible for platform initialization, secure boot, and runtime attestation services. The PSP boots before the x86 application processors and remains active throughout system runtime.",
        match: "5.2.4 — PSP Mailbox Protocol\n\nCommunication between the host x86 cores and the PSP is performed via a memory-mapped mailbox located at PSP_MAILBOX_BASE (typically 0xFEA0_0000). The host writes a command into the mailbox and signals the PSP by setting the COMMAND_VALID bit; the PSP responds by populating the response field and setting RESPONSE_VALID.",
        after: "All mailbox transactions are serialized by the PSP firmware; concurrent commands from multiple cores must be coordinated by the BIOS using a software lock prior to mailbox access. Failure to do so will result in undefined behavior including potential PSP firmware crashes."
      }
    },
    {
      id: "r4",
      score: 0.9189,
      bm25: 0.93,
      semantic: 0.86,
      spec: "ACPI Specification 6.5",
      specShort: "ACPI-6.5",
      vendor: "UEFI Forum",
      type: "ACPI",
      category: "BIOS",
      version: "6.5",
      date: "2024-08-29",
      page: 412,
      section: "8.4.4 — Lower Power Idle States (_LPI)",
      excerpt: "The _LPI object provides a list of supported low power idle states in a format that allows the OSPM to identify the entry latency, exit latency, and minimum residency for each state. Unlike _CST, _LPI states are processor-package-scoped and may include states that span multiple cores.",
      highlight: ["_LPI", "OSPM", "_CST"],
      context: {
        before: "8.4.3 — _CST (C-States) — Legacy Definition\n\nThe _CST object enumerates per-processor idle states supported by the platform. Each entry specifies a register descriptor, type, latency, and power consumption value. This object is retained for backward compatibility with platforms that do not implement the _LPI hierarchy.",
        match: "8.4.4 — Lower Power Idle States (_LPI)\n\nThe _LPI object provides a list of supported low power idle states in a format that allows the OSPM to identify the entry latency, exit latency, and minimum residency for each state. Unlike _CST, _LPI states are processor-package-scoped and may include states that span multiple cores.",
        after: "Each _LPI package contains a revision field, the count of states, and an array of state descriptors. Each state descriptor includes the entry trigger (an integer indicating the wake source class), residency requirements, latency values, and a flags field indicating whether the state is enabled and whether it counts as the package's lowest-power state."
      }
    },
    {
      id: "r5",
      score: 0.8967,
      bm25: 0.74,
      semantic: 0.91,
      spec: "PCI Express Base Specification 6.1",
      specShort: "PCIE-6.1",
      vendor: "PCI-SIG",
      type: "PCI",
      category: "BIOS",
      version: "6.1",
      date: "2024-05-14",
      page: 1284,
      section: "7.5.1.2.3 — Enhanced Capability Header",
      excerpt: "The Enhanced Capability Header is the first DWORD of every Extended Capability structure in the PCI Express Extended Configuration Space (offsets 100h through FFFh). It contains the Capability ID, Capability Version, and a pointer to the next Extended Capability.",
      highlight: ["Extended Capability", "Configuration Space", "Capability ID"],
      context: {
        before: "7.5.1 — PCI Express Extended Configuration Space\n\nPCI Express introduces an extended configuration space of 4096 bytes per function, addressable through Memory-Mapped Configuration (MMCFG) space. The first 256 bytes maintain compatibility with conventional PCI configuration space; the remaining 3840 bytes house Extended Capability structures.",
        match: "7.5.1.2.3 — Enhanced Capability Header\n\nThe Enhanced Capability Header is the first DWORD of every Extended Capability structure in the PCI Express Extended Configuration Space (offsets 100h through FFFh). It contains the Capability ID, Capability Version, and a pointer to the next Extended Capability.",
        after: "The Next Capability Offset field is a 12-bit value that points to the next Extended Capability or contains 000h to indicate the end of the linked list. The list shall not contain cycles; system firmware encountering a cycle shall log a configuration error and terminate enumeration of the affected function."
      }
    },
    {
      id: "r6",
      score: 0.8845,
      bm25: 0.81,
      semantic: 0.85,
      spec: "Intel® Embedded Controller Interface Spec",
      specShort: "INTEL-ECIS",
      vendor: "Intel",
      type: "ME",
      category: "EC",
      version: "Rev 3.1",
      date: "2025-06-04",
      page: 34,
      section: "3.1.2 — EC SMBus Address Map",
      excerpt: "The Embedded Controller occupies SMBus slave address 0x42 (write) / 0x43 (read) on the platform SMBus segment 0. All EC register access is performed using SMBus block read and block write transactions with a single-byte command identifier.",
      highlight: ["Embedded Controller", "SMBus", "EC"],
      context: {
        before: "3.1 — Physical Bus Topology\n\nThe Embedded Controller (EC) is connected to the host platform via an SMBus interface routed through the Platform Controller Hub (PCH). On modern platforms, this is supplemented by an eSPI link providing higher-bandwidth access to EC-managed resources such as keyboard scan codes and battery telemetry.",
        match: "3.1.2 — EC SMBus Address Map\n\nThe Embedded Controller occupies SMBus slave address 0x42 (write) / 0x43 (read) on the platform SMBus segment 0. All EC register access is performed using SMBus block read and block write transactions with a single-byte command identifier.",
        after: "The EC shall not initiate SMBus transactions as a master while the host is performing PCI configuration cycles; doing so may result in arbitration loss and command corruption. The host BIOS is responsible for serializing SMBus access via the SMBus arbitration mechanism described in §3.4."
      }
    },
    {
      id: "r7",
      score: 0.8712,
      bm25: 0.86,
      semantic: 0.79,
      spec: "TCG EFI Platform Specification",
      specShort: "TCG-EFI-PS",
      vendor: "TCG",
      type: "TPM",
      category: "BIOS",
      version: "v1.22 r15",
      date: "2024-04-20",
      page: 67,
      section: "7.1 — TCG Event Log Format",
      excerpt: "The TCG Event Log is a chronological record of all measurements extended into PCRs during platform boot. Each entry contains a PCR index, an event type, a digest, and an event data field whose interpretation depends on the event type.",
      highlight: ["TCG Event Log", "PCRs", "digest"],
      context: {
        before: "7 — Event Log Architecture\n\nA conformant TCG platform produces an audit log enumerating every measurement made during boot. This log enables remote attestation services to reconstruct the boot sequence and verify that no unmeasured or unexpected code was executed prior to OS handoff.",
        match: "7.1 — TCG Event Log Format\n\nThe TCG Event Log is a chronological record of all measurements extended into PCRs during platform boot. Each entry contains a PCR index, an event type, a digest, and an event data field whose interpretation depends on the event type.",
        after: "The legacy event log format uses SHA-1 digests exclusively and is identified by the absence of an EFI_SPECID_EVENT entry as the first record. The crypto-agile event log format, introduced for TPM 2.0 platforms, supports multiple simultaneous digest algorithms and is identified by the presence of an EFI_SPECID_EVENT entry as the first record."
      }
    },
    {
      id: "r8",
      score: 0.8534,
      bm25: 0.71,
      semantic: 0.87,
      spec: "AMD AGESA™ Interface Spec",
      specShort: "AMD-AGESA-IS",
      vendor: "AMD",
      type: "ACPI",
      category: "BIOS",
      version: "ComboAM5 1.2.0.2a",
      date: "2025-07-22",
      page: 198,
      section: "12.3 — _PSS Table Generation",
      excerpt: "AGESA generates the _PSS performance state table dynamically based on detected silicon SKU and current operating conditions. The BIOS shall not statically embed _PSS data; it must instead invoke the AmdInitPost entry point and consume the returned ACPI tables verbatim.",
      highlight: ["_PSS", "AGESA", "AmdInitPost", "ACPI"],
      context: {
        before: "12 — ACPI Table Generation\n\nAGESA is responsible for generating SoC-specific ACPI table content during the BIOS DXE phase. The BIOS shim is responsible for installing these tables into the system ACPI table list and presenting them to the OS via the standard XSDT/RSDT mechanism.",
        match: "12.3 — _PSS Table Generation\n\nAGESA generates the _PSS performance state table dynamically based on detected silicon SKU and current operating conditions. The BIOS shall not statically embed _PSS data; it must instead invoke the AmdInitPost entry point and consume the returned ACPI tables verbatim.",
        after: "The _PSS table is per-processor-package and is referenced from the per-CPU device scope in the DSDT. AGESA also produces the corresponding _PCT (Performance Control), _PPC (Performance Present Capabilities), and _PSD (P-State Dependency) objects."
      }
    },
    {
      id: "r9",
      score: 0.8398,
      bm25: 0.83,
      semantic: 0.78,
      spec: "UEFI Specification 2.10",
      specShort: "UEFI-2.10",
      vendor: "UEFI Forum",
      type: "ACPI",
      category: "BIOS",
      version: "2.10 Errata A",
      date: "2024-09-06",
      page: 723,
      section: "8.5.4 — VariableLock Protocol",
      excerpt: "The EDKII_VARIABLE_LOCK_PROTOCOL provides a means for platform firmware to mark UEFI variables as read-only after a given point in boot, typically the EndOfDxe event. Once locked, a variable cannot be modified or deleted until the next platform reset.",
      highlight: ["VariableLock", "EndOfDxe", "UEFI variables"],
      context: {
        before: "8.5 — UEFI Variable Services Hardening\n\nUEFI variables are persistent storage maintained by platform firmware in non-volatile memory (typically a region of the SPI flash). Because variables can influence security-critical decisions made during subsequent boots, the platform must restrict modification of certain variables to specific points in the boot flow.",
        match: "8.5.4 — VariableLock Protocol\n\nThe EDKII_VARIABLE_LOCK_PROTOCOL provides a means for platform firmware to mark UEFI variables as read-only after a given point in boot, typically the EndOfDxe event. Once locked, a variable cannot be modified or deleted until the next platform reset.",
        after: "The VariableLock protocol is consumed by silicon initialization modules that need to publish security-policy data (e.g., Boot Guard verified-boot policy) and ensure that policy cannot be modified by later DXE drivers or by the operating system at runtime."
      }
    },
    {
      id: "r10",
      score: 0.8221,
      bm25: 0.66,
      semantic: 0.89,
      spec: "Intel® TXT Software Development Guide",
      specShort: "INTEL-TXT-SDG",
      vendor: "Intel",
      type: "TPM",
      category: "BIOS",
      version: "Rev 017",
      date: "2025-01-15",
      page: 78,
      section: "4.2 — SENTER Instruction Flow",
      excerpt: "The GETSEC[SENTER] leaf initiates a measured launch by establishing the Dynamic Root of Trust for Measurement (DRTM). All processors are placed into a known, authenticated state, the SINIT ACM is loaded and verified against the chipset, and then control is transferred to the MLE entry point.",
      highlight: ["SENTER", "DRTM", "SINIT ACM", "MLE"],
      context: {
        before: "4 — Measured Launch Environment\n\nIntel TXT provides a hardware-rooted mechanism for establishing a measured execution environment after a system has been running. Unlike the Static Root of Trust for Measurement (SRTM) initiated at platform reset, the DRTM can be invoked at any time during system runtime and provides a clean cryptographic baseline.",
        match: "4.2 — SENTER Instruction Flow\n\nThe GETSEC[SENTER] leaf initiates a measured launch by establishing the Dynamic Root of Trust for Measurement (DRTM). All processors are placed into a known, authenticated state, the SINIT ACM is loaded and verified against the chipset, and then control is transferred to the MLE entry point.",
        after: "Following SENTER completion, the platform is in an attested state suitable for hosting a tamper-evident execution environment. The MLE may then extend application-specific measurements into the DRTM PCRs (PCR[17] through PCR[22]) and resume operation."
      }
    },
    {
      id: "r11",
      score: 0.8104,
      bm25: 0.68,
      semantic: 0.87,
      spec: "Intel® EE Reference Schematic",
      specShort: "INTEL-EE-REF",
      vendor: "Intel",
      type: "ME",
      category: "EE",
      version: "Rev 2.0",
      date: "2025-04-02",
      page: 23,
      section: "2.4 — Power Sequencing Diagram",
      excerpt: "The platform power sequencer shall assert SLP_S5# deasserted no earlier than 200 ms after VRM_PG to ensure all primary rails are stable. Subsequent rails (1V05_PCH, VCCST) follow the timing requirements outlined in PDG §2.4.1.",
      highlight: ["SLP_S5", "VRM_PG", "power sequencer"],
      context: {
        before: "2 — Platform Power Architecture\n\nThe reference platform implements a multi-rail power architecture where each rail is gated by a dedicated power-good signal. The system FSM (finite state machine) advances through power states only when all required rails for the next state report stability.",
        match: "2.4 — Power Sequencing Diagram\n\nThe platform power sequencer shall assert SLP_S5# deasserted no earlier than 200 ms after VRM_PG to ensure all primary rails are stable. Subsequent rails (1V05_PCH, VCCST) follow the timing requirements outlined in PDG §2.4.1.",
        after: "Failure to honor the sequencing constraints may result in PCH register corruption or, in extreme cases, latent silicon damage. The PDG (Platform Design Guide) is the authoritative reference for power sequencing — this document summarizes only the most common timings."
      }
    },
    {
      id: "r12",
      score: 0.7954,
      bm25: 0.78,
      semantic: 0.81,
      spec: "PCI Firmware Specification 3.3",
      specShort: "PCI-FW-3.3",
      vendor: "PCI-SIG",
      type: "PCI",
      category: "BIOS",
      version: "3.3",
      date: "2024-02-11",
      page: 45,
      section: "4.6.1 — _OSC Capabilities Buffer",
      excerpt: "The _OSC method on a PCI host bridge accepts a capabilities buffer in which the OS indicates which features it intends to control natively (e.g., Native PCIe Hot Plug, AER, PME). The platform responds by either granting or masking each requested capability.",
      highlight: ["_OSC", "PCIe", "AER", "PME"],
      context: {
        before: "4.6 — OS-Firmware Capability Negotiation\n\nThe _OSC mechanism allows the OS and platform firmware to negotiate ownership of optional PCIe features at runtime. This avoids static partitioning of capabilities and allows the platform to retain control of features the OS cannot handle correctly.",
        match: "4.6.1 — _OSC Capabilities Buffer\n\nThe _OSC method on a PCI host bridge accepts a capabilities buffer in which the OS indicates which features it intends to control natively (e.g., Native PCIe Hot Plug, AER, PME). The platform responds by either granting or masking each requested capability.",
        after: "Once _OSC has been evaluated for a given host bridge, subsequent invocations may not request additional capabilities. The OS may, however, invoke _OSC again with a reduced capability set to relinquish previously-granted control."
      }
    }
  ]
};
