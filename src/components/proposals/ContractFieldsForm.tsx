import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getContractPartyLabel } from "@/lib/contractUtils";

export interface ContractFieldValues {
  title: string;
  subtitle: string;
  language: string;
  authorCopies: string;
  ifTwoAuthorCopies: string;
  ifThreeOrFourAuthorCopies: string;
  copiesSoldRevenue: string;
  secondaryRightsRevenue: string;
  publishingAgreement: string;
  addendum: string;
}

/** Returns true if all required contract fields (everything except addendum) are filled */
export function areContractFieldsValid(values: ContractFieldValues): boolean {
  return !!(
    values.title.trim() &&
    values.language.trim() &&
    values.authorCopies.trim() &&
    values.ifTwoAuthorCopies.trim() &&
    values.ifThreeOrFourAuthorCopies.trim() &&
    values.copiesSoldRevenue.trim() &&
    values.secondaryRightsRevenue.trim() &&
    values.publishingAgreement.trim()
  );
}

export function getDefaultContractFields(
  contractType: string,
  proposalTitle?: string,
  proposalSubtitle?: string
): ContractFieldValues {
  const partyLabel = getContractPartyLabel(contractType);
  return {
    title: proposalTitle || "",
    subtitle: proposalSubtitle || "",
    language: "in all languages",
    authorCopies: "two copies",
    ifTwoAuthorCopies: "two copies",
    ifThreeOrFourAuthorCopies: "one copy",
    copiesSoldRevenue: "10%",
    secondaryRightsRevenue: "20%",
    publishingAgreement: `This publishing agreement will run in perpetuity, unless agreed otherwise by both the Publisher and the ${partyLabel}.`,
    addendum: "",
  };
}

interface ContractFieldsFormProps {
  values: ContractFieldValues;
  onChange: (values: ContractFieldValues) => void;
  contractType: string;
  idPrefix?: string;
}

const ContractFieldsForm: React.FC<ContractFieldsFormProps> = ({
  values,
  onChange,
  contractType,
  idPrefix = "cf",
}) => {
  const update = (patch: Partial<ContractFieldValues>) =>
    onChange({ ...values, ...patch });

  // Auto-update the agreement text when contract type changes
  React.useEffect(() => {
    const partyLabel = getContractPartyLabel(contractType);
    const expectedSuffix = `the Publisher and the ${partyLabel}.`;
    if (!values.publishingAgreement.endsWith(expectedSuffix)) {
      const otherParty = contractType === "editor" ? "Author" : "Editor";
      const oldSuffix = `the Publisher and the ${otherParty}.`;
      if (values.publishingAgreement.endsWith(oldSuffix)) {
        update({
          publishingAgreement: values.publishingAgreement.replace(
            oldSuffix,
            expectedSuffix
          ),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractType]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>Title <span className="text-destructive">*</span></Label>
        <Input
          id={`${idPrefix}-title`}
          value={values.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Enter title"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-subtitle`}>Subtitle</Label>
        <Input
          id={`${idPrefix}-subtitle`}
          value={values.subtitle}
          onChange={(e) => update({ subtitle: e.target.value })}
          placeholder="Enter subtitle (optional)"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-language`}>Publication Language <span className="text-destructive">*</span></Label>
        <Input
          id={`${idPrefix}-language`}
          value={values.language}
          onChange={(e) => update({ language: e.target.value })}
          placeholder="e.g. in all languages"
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-copies`} className="text-xs">
            Complimentary Copies on Publication <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-copies`}
            value={values.authorCopies}
            onChange={(e) =>
              update({ authorCopies: e.target.value })
            }
            placeholder="e.g. two copies"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-two-copies`} className="text-xs">
            Complimentary Copies Each - 2 Authors <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-two-copies`}
            value={values.ifTwoAuthorCopies}
            onChange={(e) =>
              update({ ifTwoAuthorCopies: e.target.value })
            }
            placeholder="e.g. two copies"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-three-copies`} className="text-xs">
            Complimentary Copies Each - 3 or 4 Authors <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-three-copies`}
            value={values.ifThreeOrFourAuthorCopies}
            onChange={(e) =>
              update({
                ifThreeOrFourAuthorCopies: e.target.value,
              })
            }
            placeholder="e.g. one copy"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-book-royalty`} className="text-xs">
            Author Royalty - Book Sales (%) <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-book-royalty`}
            value={values.copiesSoldRevenue}
            onChange={(e) =>
              update({
                copiesSoldRevenue: e.target.value,
              })
            }
            placeholder="e.g. 10%"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-other-royalty`} className="text-xs">
            Author Royalty - Other Rights (%) <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-other-royalty`}
            value={values.secondaryRightsRevenue}
            onChange={(e) =>
              update({
                secondaryRightsRevenue: e.target.value,
              })
            }
            placeholder="e.g. 20%"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-agreement`}>Agreement Duration <span className="text-destructive">*</span></Label>
        <Textarea
          id={`${idPrefix}-agreement`}
          value={values.publishingAgreement}
          onChange={(e) => update({ publishingAgreement: e.target.value })}
          rows={3}
          className="resize-none text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-addendum`}>Addendum (Optional)</Label>
        <Textarea
          id={`${idPrefix}-addendum`}
          value={values.addendum}
          onChange={(e) => update({ addendum: e.target.value })}
          rows={3}
          placeholder="Enter any additional terms or conditions..."
          className="resize-none text-sm"
        />
      </div>
    </div>
  );
};

export default ContractFieldsForm;
