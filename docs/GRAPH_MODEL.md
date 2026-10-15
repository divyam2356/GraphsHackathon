# Graph model (single graph `blackbox`)

**Built:** the model and counts in the README ("Graph model"). This file is the original plan.
Not built yet: HotSpot, Alert, Observation, Case, OrgTail, WorkOrder, ShiftNote, EXAMPLE_OF,
MERGED_INTO, Location-NEAR (the build uses Location-WITHIN for the bin -> line -> zone hierarchy),
embeddings. Sizes below are the full public data, not what is loaded.

REAL: Accident-FOUND->Finding-AT->Location; Accident-INVOLVED->Aircraft-IS_A->Model;
Report-ON->Aircraft; Report-AT->Location(family,zone,station_bin,stringer,side);
Location-NEAR->Location; FixOrder-APPLIES_TO->Model; FixOrder-SUPERSEDES->FixOrder; FixOrder-TARGETS->Location.
LEARNED: FailureMode-AT->Location; FailureMode-FOR->Model; FailureMode-SIGNATURE(weight)->Location;
Accident-EXAMPLE_OF->FailureMode; Report-PRECURSOR_OF(conf,reason,asOf)->Accident;
HotSpot-AT->Location; Alert-FOR->Aircraft; Alert-MATCHES->FailureMode;
Observation-ON->Aircraft; Observation-AT->Location; Case-CONSIDERED(score)->FailureMode;
Case-SUPPORTS->FailureMode; FailureMode-MERGED_INTO->FailureMode.
ORG (synthetic:true): Engineer-MEMBER_OF->Team-OWNS->TaskCard-CITES->FixOrder;
Engineer-SIGNED_OFF->WorkOrder-ON->OrgTail-IS_A->Model; WorkOrder-AT->Location;
ShiftNote-MENTIONS->OrgTail; Decision-BASED_ON->(FixOrder|Accident|FailureMode).
Location bins ~20in stations; nearby cracks share a node. Sizes: ~1.17M reports, 31k accidents,
32k aircraft, 73k findings, 10k+ fix orders (FR API caps at 10k), few k locations.
Vectors: embed demo systems only (structures/engines) — full 1.17M ≈1.8GB.
