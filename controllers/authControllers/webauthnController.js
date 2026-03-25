import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

import User from "../../models/authModels/User.js";
import redisClient from "../../services/redisClient.js";

const rpName = "Onscreen Marking System";
const rpID = "localhost";
const origin = "http://localhost:3000";

/* -------------------------------------------------------------------------- */
/*                          REGISTER OPTIONS                                  */
/* -------------------------------------------------------------------------- */

export const webauthnRegisterOptions = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const user = await User.findOne({ email });

    const options = await generateRegistrationOptions({
      rpName,
      rpID,

      userID: user
        ? new TextEncoder().encode(user._id.toString())
        : new TextEncoder().encode(email),

      userName: email,

      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },

      timeout: 60000,

      excludeCredentials: user?.webauthn?.credentialID
        ? [
            {
              id: Buffer.from(user.webauthn.credentialID, "base64"),
              type: "public-key",
            },
          ]
        : [],
    });

    await redisClient.setEx(
      `webauthn:challenge:${email}`,
      300,
      options.challenge,
    );

    res.json(options);
  } catch (error) {
    console.error("Register Options Error:", error);
    res
      .status(500)
      .json({ message: "Failed to generate registration options" });
  }
};

/* -------------------------------------------------------------------------- */
/*                          REGISTER VERIFY                                   */
/* -------------------------------------------------------------------------- */

export const webauthnRegisterVerify = async (req, res) => {
  try {
    const body = req.body;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const expectedChallenge = await redisClient.get(
      `webauthn:challenge:${email}`,
    );

    if (!expectedChallenge) {
      return res.status(400).json({ message: "Challenge expired" });
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    const { verified, registrationInfo } = verification;

    if (!verified || !registrationInfo?.credential) {
      return res.status(400).json({ success: false });
    }

    const { credential } = registrationInfo;

    const credentialID = credential.id;
    const credentialPublicKey = credential.publicKey;
    const counter = credential.counter;

    const credentialData = {
      credentialID: Buffer.from(credentialID).toString("base64"),
      credentialPublicKey: Buffer.from(credentialPublicKey).toString("base64"),
      counter,
    };

    await redisClient.del(`webauthn:challenge:${email}`);

    return res.json({
      success: true,
      ...credentialData,
    });
  } catch (error) {
    console.error("Register Verify Error:", error);
    res.status(500).json({ message: "Upload failed" });
  }
};

/* -------------------------------------------------------------------------- */
/*                          LOGIN OPTIONS                                     */
/* -------------------------------------------------------------------------- */

export const webauthnLoginOptions = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.webauthn?.credentialID) {
      return res.status(404).json({ message: "Fingerprint not registered" });
    }

    const options = await generateAuthenticationOptions({
      rpID,

      allowCredentials: [
        {
          id: Buffer.from(user.webauthn.credentialID, "base64"),
          type: "public-key",
        },
      ],

      userVerification: "required",
    });

    await redisClient.setEx(
      `webauthn:challenge:${email}`,
      300,
      options.challenge,
    );

    res.json(options);
  } catch (error) {
    console.error("Login Options Error:", error);
    res.status(500).json({ message: "Failed to generate login options" });
  }
};

/* -------------------------------------------------------------------------- */
/*                          LOGIN VERIFY                                      */
/* -------------------------------------------------------------------------- */

export const webauthnLoginVerify = async (req, res) => {
  try {
    const body = req.body;
    const { email } = req.body;

    const expectedChallenge = await redisClient.get(
      `webauthn:challenge:${email}`,
    );

    if (!expectedChallenge) {
      return res.status(400).json({ message: "Challenge expired" });
    }

    const user = await User.findOne({ email });

    if (!user || !user.webauthn?.credentialID) {
      return res.status(400).json({ message: "Credential not found" });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: Buffer.from(user.webauthn.credentialID, "base64"),
        credentialPublicKey: Buffer.from(
          user.webauthn.credentialPublicKey,
          "base64",
        ),
        counter: user.webauthn.counter,
      },
    });

    const { verified, authenticationInfo } = verification;

    if (!verified) {
      return res.status(401).json({ success: false });
    }

    user.webauthn.counter = authenticationInfo.newCounter;

    await user.save();

    await redisClient.del(`webauthn:challenge:${email}`);

    res.json({
      success: true,
      userId: user._id,
    });
  } catch (error) {
    console.error("Login Verify Error:", error);
    res.status(500).json({ message: "Login failed" });
  }
};
