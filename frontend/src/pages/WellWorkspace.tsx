import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

export function WellWorkspace() {
  const { wellId } = useParams<{ wellId: string }>();
  const navigate = useNavigate();

  // Redirect to Dispatch Desk with this well pre-selected
  useEffect(() => {
    if (wellId) {
      navigate(`/dispatch-desk?wellId=${wellId}`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [wellId, navigate]);

  return null;
}
