import { redirect } from "next/navigation";
import { requireCdaUser } from "@/lib/cda/access";

/**
 * The portal's front door. Every role has a different one, so this only routes.
 */
export default async function CdaHome() {
  const user = await requireCdaUser();
  redirect(user.cda === "CLUB" ? "/cda/club" : user.cda === "ASSESSOR" ? "/cda/assess" : "/cda/cdu");
}
