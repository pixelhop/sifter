import { defineEventHandler, getRouterParam } from "h3";
import { errors } from "../../../../utils/errors";
import { usePrismaClient } from "../../../../utils/prisma";
import { getCurrentUser } from "../../../../utils/user";

// DELETE /api/podcasts/subscriptions/:id
export default defineEventHandler(async (event) => {
  const subscriptionId = getRouterParam(event, "id");

  if (!subscriptionId) {
    throw errors.badRequest("Subscription ID is required");
  }

  const user = await getCurrentUser(event);
  const prisma = usePrismaClient();

  // Find the subscription
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    throw errors.notFound("Subscription");
  }

  // Verify ownership
  if (subscription.userId !== user.id) {
    throw errors.forbidden("You can only delete your own subscriptions");
  }

  // Delete the subscription
  await prisma.subscription.delete({
    where: { id: subscriptionId },
  });

  return { success: true };
});
