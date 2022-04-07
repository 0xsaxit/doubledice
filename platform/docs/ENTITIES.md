```mermaid
erDiagram
    Category ||--|{ Subcategory: has
    Subcategory ||--|{ VirtualFloor: has

    Category ||--|{ VirtualFloor: has

    VirtualFloor ||--|{ Outcome: has
    VirtualFloor ||--o{ UserVirtualFloor: has

    Outcome ||--o{ UserOutcomeTimeslot: has
    Outcome ||--o{ OutcomeTimeslot: has
    Outcome ||--o{ UserOutcome: has

    User ||--o{ UserVirtualFloor: has
    User ||--o{ UserOutcome: has
    User ||--o{ UserOutcomeTimeslot: has

    UserOutcome ||--o{ UserOutcomeTimeslot: has
    OutcomeTimeslot ||--o{ UserOutcomeTimeslot: has

    UserVirtualFloor ||--o{ UserOutcome: has

    VirtualFloor {
        BigInt virtualFloorId
        BigDecimal totalSupply
    }
    Outcome {
        Int outcomeIndex
        BigDecimal totalSupply
        BigDecimal totalWeightedSupply
    }
    OutcomeTimeslot {
        BigInt timeslot
        BigInt tokenId
        BigDecimal beta
        BigDecimal totalSupply
    }
    UserOutcome {
        BigDecimal totalBalance
        BigDecimal totalWeightedBalance
    }
    UserOutcomeTimeslot {
        BigDecimal balance
    }
    UserVirtualFloor {
        BigDecimal totalBalance
    }
```
